// Minimal typed Trello REST client for per-project board linking + sync
// (server/trelloLinks.ts, server/trelloSync.ts). Auth is the app's public
// API key plus the connected user's personal token, obtained through
// Trello's own browser authorize flow — see authorizeUrl() below and the
// /api/trello/authorize-url + /trello/callback wiring in index.ts. Mirrors
// the request shape scripts/trello-sync.mjs already uses for the separate
// repo-maintenance board sync.
const API_BASE = "https://api.trello.com/1";

export interface TrelloCredentials {
  key: string;
  token: string;
}

export class TrelloError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TrelloError";
    this.status = status;
  }
}

export interface TrelloBoard {
  id: string;
  name: string;
  url: string;
  closed: boolean;
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  idList: string;
  closed: boolean;
  shortLink: string;
  url: string;
  dateLastActivity: string;
}

export const STATUS_LIST_NAMES = { todo: "Todo", doing: "Doing", review: "Review", done: "Done" } as const;
export type TrelloStatusKey = keyof typeof STATUS_LIST_NAMES;
export type TrelloStatusLists = Record<TrelloStatusKey, string>;

async function trelloFetch(
  creds: TrelloCredentials,
  endpoint: string,
  { method = "GET", params, body }: { method?: string; params?: Record<string, string>; body?: unknown } = {},
): Promise<any> {
  const url = new URL(`${API_BASE}${endpoint}`);
  url.searchParams.set("key", creds.key);
  url.searchParams.set("token", creds.token);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
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
export function authorizeUrl(key: string, returnUrl: string, appName = "Gerer Build Studio"): string {
  const url = new URL("https://trello.com/1/authorize");
  url.searchParams.set("key", key);
  url.searchParams.set("name", appName);
  url.searchParams.set("scope", "read,write");
  url.searchParams.set("expiration", "never");
  url.searchParams.set("response_type", "token");
  url.searchParams.set("return_url", returnUrl);
  return url.toString();
}

export function getMember(creds: TrelloCredentials): Promise<{ id: string; fullName: string; username: string }> {
  return trelloFetch(creds, "/members/me", { params: { fields: "id,fullName,username" } });
}

export function listBoards(creds: TrelloCredentials): Promise<TrelloBoard[]> {
  return trelloFetch(creds, "/members/me/boards", { params: { fields: "name,url,closed", filter: "open" } });
}

export function createBoard(creds: TrelloCredentials, name: string): Promise<TrelloBoard> {
  return trelloFetch(creds, "/boards", { method: "POST", params: { name, defaultLists: "false" } });
}

export function listLists(creds: TrelloCredentials, boardId: string): Promise<TrelloList[]> {
  return trelloFetch(creds, `/boards/${boardId}/lists`, { params: { fields: "name,closed", filter: "open" } });
}

/** Reuses open lists already named Todo/Doing/Review/Done on the board, and
 * creates any missing one. Idempotent — safe to call on every link/re-link. */
export async function ensureStatusLists(creds: TrelloCredentials, boardId: string): Promise<TrelloStatusLists> {
  const existing = await listLists(creds, boardId);
  const ids = {} as TrelloStatusLists;
  for (const [status, label] of Object.entries(STATUS_LIST_NAMES) as Array<[TrelloStatusKey, string]>) {
    const found = existing.find((list) => list.name === label);
    ids[status] = found
      ? found.id
      : (await trelloFetch(creds, `/boards/${boardId}/lists`, { method: "POST", params: { name: label, pos: "bottom" } })).id;
  }
  return ids;
}

export function listBoardCards(creds: TrelloCredentials, boardId: string): Promise<TrelloCard[]> {
  return trelloFetch(creds, `/boards/${boardId}/cards`, {
    params: { fields: "name,desc,idList,closed,shortLink,url,dateLastActivity" },
  });
}

export function createCard(creds: TrelloCredentials, input: { listId: string; name: string; desc?: string }): Promise<TrelloCard> {
  return trelloFetch(creds, "/cards", {
    method: "POST",
    body: { idList: input.listId, name: input.name, desc: input.desc ?? "" },
  });
}

export function updateCard(
  creds: TrelloCredentials,
  cardId: string,
  patch: { name?: string; desc?: string; idList?: string; closed?: boolean },
): Promise<TrelloCard> {
  return trelloFetch(creds, `/cards/${cardId}`, { method: "PUT", body: patch });
}
