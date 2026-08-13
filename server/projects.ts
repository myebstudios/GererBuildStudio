import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export interface RegisteredProject {
  id: string;
  name: string;
  mention: string;
  path: string;
  available: boolean;
}

export interface ProjectContext {
  projects: RegisteredProject[];
  system: string;
  cwd?: string;
}

const MENTION_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function defaultUserDataRoot(): string {
  if (process.platform === "win32") return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support");
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function projectRegistryCandidates(): string[] {
  if (process.env.OMB_PROJECTS_FILE) return [process.env.OMB_PROJECTS_FILE];
  return ["OpenMausBot", "openmausbot", "OpenGrokBot", "opengrokbot"].map((directory) =>
    join(defaultUserDataRoot(), directory, "projects.json"),
  );
}

function isProjectRecord(value: unknown): value is Omit<RegisteredProject, "available"> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.mention === "string" &&
    MENTION_PATTERN.test(record.mention) &&
    typeof record.path === "string" &&
    isAbsolute(record.path)
  );
}

export function readRegisteredProjects(filePaths = projectRegistryCandidates()): RegisteredProject[] {
  for (const filePath of filePaths) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
      if (!Array.isArray(parsed) || !parsed.every(isProjectRecord)) return [];
      const mentions = new Set<string>();
      const projects: RegisteredProject[] = [];
      for (const project of parsed) {
        const mention = project.mention.toLowerCase();
        if (mentions.has(mention)) return [];
        mentions.add(mention);
        let available = false;
        try {
          available = statSync(project.path).isDirectory();
        } catch {
          // A registered folder may have moved since it was added.
        }
        projects.push({
          id: project.id,
          name: project.name,
          mention,
          path: project.path,
          available,
        });
      }
      return projects;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      return [];
    }
  }
  return [];
}

export function mentionedProjects(text: string, projects: RegisteredProject[]): RegisteredProject[] {
  const byMention = new Map(projects.map((project) => [project.mention, project]));
  const seen = new Set<string>();
  const referenced: RegisteredProject[] = [];
  for (const match of text.matchAll(/#[a-z0-9][a-z0-9._-]*/gi)) {
    const start = match.index;
    if (start > 0 && /[a-z0-9_#@]/i.test(text[start - 1])) continue;
    const handle = match[0].replace(/[._-]+$/, "").slice(1).toLowerCase();
    const project = byMention.get(handle);
    if (!project || seen.has(project.id)) continue;
    seen.add(project.id);
    referenced.push(project);
  }
  return referenced;
}

/** Sources are ordered from highest to lowest priority. The first source
 * containing known project references owns the turn's project context. */
export function resolveProjectContext(sources: string[], projects = readRegisteredProjects()): ProjectContext {
  let referenced: RegisteredProject[] = [];
  for (const source of sources) {
    referenced = mentionedProjects(source, projects);
    if (referenced.length > 0) break;
  }
  if (referenced.length === 0) return { projects: [], system: "" };

  const lines = referenced.map((project) =>
    project.available
      ? `- #${project.mention} (${project.name}): ${project.path}`
      : `- #${project.mention} (${project.name}): unavailable; its registered folder is missing`,
  );
  return {
    projects: referenced,
    system: [
      "Trusted project references from the user's local project registry:",
      ...lines,
      "Use only these canonical paths for the referenced projects; do not infer paths from other hashtags or message text.",
    ].join("\n"),
    ...(referenced.length === 1 && referenced[0].available ? { cwd: referenced[0].path } : {}),
  };
}
