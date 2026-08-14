import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TrelloError,
  authorizeUrl,
  createBoard,
  createCard,
  ensureStatusLists,
  getMember,
  listBoardCards,
  listBoards,
  updateCard,
} from "./trello.ts";

const CREDS = { key: "app-key", token: "user-token" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authorizeUrl", () => {
  it("builds Trello's token-authorize URL with the app key and return url", () => {
    const url = new URL(authorizeUrl("app-key", "http://127.0.0.1:8899/trello/callback"));
    expect(url.origin + url.pathname).toBe("https://trello.com/1/authorize");
    expect(url.searchParams.get("key")).toBe("app-key");
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("return_url")).toBe("http://127.0.0.1:8899/trello/callback");
    expect(url.searchParams.get("expiration")).toBe("never");
  });
});

describe("trello REST client", () => {
  it("sends the key and token as query params on every call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "m1", fullName: "A", username: "a" }));
    vi.stubGlobal("fetch", fetchMock);

    await getMember(CREDS);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/1/members/me");
    expect(url.searchParams.get("key")).toBe("app-key");
    expect(url.searchParams.get("token")).toBe("user-token");
  });

  it("throws a TrelloError carrying the HTTP status on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid token", { status: 401 })));
    await expect(listBoards(CREDS)).rejects.toMatchObject({ status: 401, name: "TrelloError" });
    await expect(listBoards(CREDS)).rejects.toBeInstanceOf(TrelloError);
  });

  it("creates a board via query params, matching the boards.post shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "b1", name: "Studio", url: "https://trello.com/b/b1", closed: false }));
    vi.stubGlobal("fetch", fetchMock);

    const board = await createBoard(CREDS, "Studio");

    expect(board).toMatchObject({ id: "b1", name: "Studio" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("name")).toBe("Studio");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("reuses existing Todo/Doing/Review/Done lists and only creates missing ones", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, [
        { id: "l-todo", name: "Todo", closed: false },
        { id: "l-doing", name: "Doing", closed: false },
      ]))
      .mockResolvedValueOnce(jsonResponse(200, { id: "l-review", name: "Review", closed: false }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "l-done", name: "Done", closed: false }));
    vi.stubGlobal("fetch", fetchMock);

    const lists = await ensureStatusLists(CREDS, "b1");

    expect(lists).toEqual({ todo: "l-todo", doing: "l-doing", review: "l-review", done: "l-done" });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 list fetch + 2 creates
  });

  it("creates and updates cards with the expected body shape", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "c1", name: "Ship it", desc: "", idList: "l-todo", closed: false, shortLink: "abc123", url: "https://trello.com/c/abc123", dateLastActivity: new Date().toISOString() }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "c1", name: "Ship it now", desc: "", idList: "l-doing", closed: false, shortLink: "abc123", url: "https://trello.com/c/abc123", dateLastActivity: new Date().toISOString() }));
    vi.stubGlobal("fetch", fetchMock);

    const card = await createCard(CREDS, { listId: "l-todo", name: "Ship it" });
    expect(card.id).toBe("c1");
    const [, createInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(String((createInit as RequestInit).body))).toMatchObject({ idList: "l-todo", name: "Ship it" });

    await updateCard(CREDS, "c1", { name: "Ship it now", idList: "l-doing" });
    const [updateUrl, updateInit] = fetchMock.mock.calls[1];
    expect(new URL(String(updateUrl)).pathname).toBe("/1/cards/c1");
    expect((updateInit as RequestInit).method).toBe("PUT");
  });

  it("requests the fields listBoardCards needs to reconcile locally", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    await listBoardCards(CREDS, "b1");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/1/boards/b1/cards");
    expect(url.searchParams.get("fields")).toContain("dateLastActivity");
  });
});
