// Minimal typed Trello REST client for per-project board linking + sync
// (server/trelloLinks.ts, server/trelloSync.ts). Auth is the app's public
// API key plus the connected user's personal token, obtained through
// Trello's own browser authorize flow — see authorizeUrl() below and the
// /api/trello/authorize-url + /trello/callback wiring in index.ts. Mirrors
// the request shape scripts/trello-sync.mjs already uses for the separate
// repo-maintenance board sync.
const API_BASE = "https://api.trello.com/1";
export class TrelloError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.name = "TrelloError";
        this.status = status;
    }
}
export const STATUS_LIST_NAMES = { todo: "Todo", doing: "Doing", review: "Review", done: "Done" };
async function trelloFetch(creds, endpoint, { method = "GET", params, body } = {}) {
    const url = new URL(`${API_BASE}${endpoint}`);
    url.searchParams.set("key", creds.key);
    url.searchParams.set("token", creds.token);
    for (const [k, v] of Object.entries(params ?? {}))
        url.searchParams.set(k, v);
    const res = await fetch(url, {
        method,
        headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new TrelloError(res.status, `Trello API error ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return res.status === 204 ? undefined : res.json();
}
/** Builds the browser URL that starts Trello's token-authorization flow.
 * `returnUrl` must be reachable by the user's browser (our own
 * /trello/callback page); Trello appends `#token=...` to it on approval. */
export function authorizeUrl(key, returnUrl, appName = "Gerer Build Studio") {
    const url = new URL("https://trello.com/1/authorize");
    url.searchParams.set("key", key);
    url.searchParams.set("name", appName);
    url.searchParams.set("scope", "read,write");
    url.searchParams.set("expiration", "never");
    url.searchParams.set("response_type", "token");
    url.searchParams.set("return_url", returnUrl);
    return url.toString();
}
export function getMember(creds) {
    return trelloFetch(creds, "/members/me", { params: { fields: "id,fullName,username" } });
}
export function listBoards(creds) {
    return trelloFetch(creds, "/members/me/boards", { params: { fields: "name,url,closed", filter: "open" } });
}
export function createBoard(creds, name) {
    return trelloFetch(creds, "/boards", { method: "POST", params: { name, defaultLists: "false" } });
}
export function listLists(creds, boardId) {
    return trelloFetch(creds, `/boards/${boardId}/lists`, { params: { fields: "name,closed", filter: "open" } });
}
/** Reuses open lists already named Todo/Doing/Review/Done on the board, and
 * creates any missing one. Idempotent — safe to call on every link/re-link. */
export async function ensureStatusLists(creds, boardId) {
    const existing = await listLists(creds, boardId);
    const ids = {};
    for (const [status, label] of Object.entries(STATUS_LIST_NAMES)) {
        const found = existing.find((list) => list.name === label);
        ids[status] = found
            ? found.id
            : (await trelloFetch(creds, `/boards/${boardId}/lists`, { method: "POST", params: { name: label, pos: "bottom" } })).id;
    }
    return ids;
}
export function listBoardCards(creds, boardId) {
    return trelloFetch(creds, `/boards/${boardId}/cards`, {
        params: { fields: "name,desc,idList,closed,shortLink,url,dateLastActivity" },
    });
}
export function createCard(creds, input) {
    return trelloFetch(creds, "/cards", {
        method: "POST",
        body: { idList: input.listId, name: input.name, desc: input.desc ?? "" },
    });
}
export function updateCard(creds, cardId, patch) {
    return trelloFetch(creds, `/cards/${cardId}`, { method: "PUT", body: patch });
}
