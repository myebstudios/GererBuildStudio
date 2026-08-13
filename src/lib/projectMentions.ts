import type { ProjectRecord } from "@/types/ogb";

export interface ProjectMentionQuery {
  start: number;
  query: string;
}

export interface ProjectMentionMatch {
  start: number;
  end: number;
  text: string;
  project: ProjectRecord;
}

const HANDLE_CHARACTER = /[a-z0-9._-]/i;

export function projectMentionQueryAt(text: string, caret: number): ProjectMentionQuery | null {
  const upto = text.slice(0, caret);
  const start = upto.lastIndexOf("#");
  if (start < 0) return null;
  if (start > 0 && /[a-z0-9_#@]/i.test(upto[start - 1])) return null;
  const query = upto.slice(start + 1);
  if (query.length > 64 || [...query].some((character) => !HANDLE_CHARACTER.test(character))) return null;
  return { start, query };
}

export function insertProjectMention(text: string, caret: number, query: ProjectMentionQuery, mention: string) {
  const next = `${text.slice(0, query.start)}#${mention} ${text.slice(caret).replace(/^ /, "")}`;
  return { text: next, caret: query.start + mention.length + 2 };
}

export function projectMentionMatches(text: string, projects: ProjectRecord[]): ProjectMentionMatch[] {
  if (!text || projects.length === 0) return [];
  const byMention = new Map(projects.map((project) => [project.mention.toLowerCase(), project]));
  const matches: ProjectMentionMatch[] = [];
  const pattern = /#[a-z0-9][a-z0-9._-]*/gi;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > 0 && /[a-z0-9_#@]/i.test(text[start - 1])) continue;
    const token = match[0].replace(/[._-]+$/, "");
    const project = byMention.get(token.slice(1).toLowerCase());
    if (!project) continue;
    matches.push({ start, end: start + token.length, text: token, project });
  }
  return matches;
}

export function referencedProjects(text: string, projects: ProjectRecord[]): ProjectRecord[] {
  const seen = new Set<string>();
  return projectMentionMatches(text, projects)
    .map((match) => match.project)
    .filter((project) => !seen.has(project.id) && Boolean(seen.add(project.id)));
}
