import type { TaskRecord } from "@/lib/taskBoard";

export interface TaskMentionQuery {
  start: number;
  query: string;
}

export interface TaskMentionMatch {
  start: number;
  end: number;
  text: string;
  task: TaskRecord;
}

const HANDLE_CHARACTER = /[a-z0-9._-]/i;

export function taskMentionQueryAt(text: string, caret: number): TaskMentionQuery | null {
  const upto = text.slice(0, caret);
  const start = upto.lastIndexOf("%");
  if (start < 0) return null;
  if (start > 0 && /[a-z0-9_#@%]/i.test(upto[start - 1])) return null;
  const query = upto.slice(start + 1);
  if (query.length > 64 || [...query].some((character) => !HANDLE_CHARACTER.test(character))) return null;
  return { start, query };
}

export function insertTaskMention(text: string, caret: number, query: TaskMentionQuery, mention: string) {
  const next = `${text.slice(0, query.start)}%${mention} ${text.slice(caret).replace(/^ /, "")}`;
  return { text: next, caret: query.start + mention.length + 2 };
}

export function taskMentionMatches(text: string, tasks: TaskRecord[]): TaskMentionMatch[] {
  if (!text || tasks.length === 0) return [];
  const byMention = new Map(tasks.map((task) => [task.mention.toLowerCase(), task]));
  const matches: TaskMentionMatch[] = [];
  const pattern = /%[a-z0-9][a-z0-9._-]*/gi;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > 0 && /[a-z0-9_#@%]/i.test(text[start - 1])) continue;
    const token = match[0].replace(/[._-]+$/, "");
    const task = byMention.get(token.slice(1).toLowerCase());
    if (!task) continue;
    matches.push({ start, end: start + token.length, text: token, task });
  }
  return matches;
}
