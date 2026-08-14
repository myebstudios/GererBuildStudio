// Client-side shapes for the /api/trello/* routes (server/index.ts +
// server/trelloLinks.ts). Mirrors the taskBoard.ts convention of a small
// typed module the components import from instead of inlining `any`.
export interface TrelloBoardOption {
  id: string;
  name: string;
  url: string;
  closed: boolean;
}

export interface TrelloStatusLists {
  todo: string;
  doing: string;
  review: string;
  done: string;
}

export interface TrelloProjectLink {
  projectId: string;
  boardId: string;
  boardName: string;
  boardUrl: string;
  lists: TrelloStatusLists;
  linkedAt: number;
  project: { id: string; name: string; mention: string; available: boolean };
}
