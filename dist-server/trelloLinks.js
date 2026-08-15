// Persists which registered project is linked to which Trello board, plus
// the board's four status-list ids. One local file, same atomic
// temp-file-then-rename + external-change reconciliation style as
// server/tasks.ts's TaskStore. Consumed by the /api/trello/links routes in
// index.ts and by server/trelloSync.ts.
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const LINKS_FILE = "trello-links.json";
const STATUS_KEYS = ["todo", "doing", "review", "done"];
function isStatusLists(value) {
    if (!value || typeof value !== "object")
        return false;
    const lists = value;
    return STATUS_KEYS.every((key) => typeof lists[key] === "string" && lists[key].length > 0);
}
function isLinkRecord(value) {
    if (!value || typeof value !== "object")
        return false;
    const link = value;
    return (typeof link.boardId === "string" && link.boardId.length > 0 &&
        typeof link.boardName === "string" &&
        typeof link.boardUrl === "string" &&
        isStatusLists(link.lists) &&
        typeof link.linkedAt === "number");
}
export class TrelloLinkStore {
    filePath;
    links;
    fileStamp = null;
    constructor(dataDir) {
        mkdirSync(dataDir, { recursive: true });
        this.filePath = join(dataDir, LINKS_FILE);
        this.links = new Map();
        this.reloadIfChanged(true);
    }
    diskStamp() {
        try {
            const stat = statSync(this.filePath);
            return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
        }
        catch (error) {
            if (error?.code === "ENOENT")
                return null;
            throw error;
        }
    }
    /** Silently keeps the last-good in-memory state on a malformed file — a
     * link store is convenience state, not the source of truth for tasks, so
     * this never throws and blocks the board like TaskStore does. */
    reloadIfChanged(force = false) {
        const stamp = this.diskStamp();
        if (!force && stamp === this.fileStamp)
            return;
        if (stamp === null) {
            this.links = new Map();
            this.fileStamp = null;
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
        }
        catch {
            return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return;
        const next = new Map();
        for (const [projectId, value] of Object.entries(parsed)) {
            if (isLinkRecord(value))
                next.set(projectId, value);
        }
        this.links = next;
        this.fileStamp = stamp;
    }
    save() {
        const temporary = `${this.filePath}.${process.pid}.tmp`;
        const payload = Object.fromEntries(this.links);
        try {
            writeFileSync(temporary, JSON.stringify(payload, null, 2), { mode: 0o600 });
            renameSync(temporary, this.filePath);
            this.fileStamp = this.diskStamp();
        }
        catch (error) {
            try {
                unlinkSync(temporary);
            }
            catch { }
            throw error;
        }
    }
    list() {
        this.reloadIfChanged();
        return [...this.links.entries()].map(([projectId, link]) => ({ projectId, ...link }));
    }
    get(projectId) {
        this.reloadIfChanged();
        const link = this.links.get(projectId);
        return link ? { projectId, ...link } : undefined;
    }
    set(projectId, link) {
        this.reloadIfChanged();
        this.links.set(projectId, link);
        this.save();
        return { projectId, ...link };
    }
    unlink(projectId) {
        this.reloadIfChanged();
        const existed = this.links.delete(projectId);
        if (existed)
            this.save();
        return existed;
    }
}
