#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TASKS_DIR = path.join(ROOT, 'docs', 'dev', 'fixes');
const API_BASE = 'https://api.trello.com/1';
const MANAGED_MARKER = 'ai-workflow-scope';
const STATUS_LISTS = {
  todo: 'Todo',
  doing: 'Doing',
  review: 'Review',
  done: 'Done',
};

loadEnvironment();

const apiKey = process.env.TRELLO_API_KEY;
const token = process.env.TRELLO_TOKEN;
const boardName = process.env.TRELLO_BOARD_NAME || readProjectName() || 'Project Tasks';

if (!apiKey || !token) {
  console.error('Missing TRELLO_API_KEY or TRELLO_TOKEN. Configure them in .env.local.');
  process.exit(1);
}

function loadEnvironment() {
  for (const filename of ['.env.local', '.env']) {
    const envPath = path.join(ROOT, filename);
    if (!fs.existsSync(envPath)) continue;

    for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator < 1) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function readProjectName() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return packageJson.name;
  } catch {
    return undefined;
  }
}

async function trelloFetch(endpoint, { method = 'GET', params, body } = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('token', token);

  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Trello API error ${response.status} ${response.statusText}: ${detail}`);
  }

  return response.status === 204 ? undefined : response.json();
}

function parseTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];

  return fs
    .readdirSync(TASKS_DIR)
    .map((filename) => {
      const match = filename.match(/^(todo|doing|review|done)--(.+)\.md$/);
      if (!match) return undefined;

      const [, status, scope] = match;
      const content = fs.readFileSync(path.join(TASKS_DIR, filename), 'utf8');
      const title = content.match(/^#\s+(.+)$/m)?.[1].trim() || scope;
      const owner = content.match(/^owner:\s*(.+)$/m)?.[1].trim() || 'unassigned';
      const items = [...content.matchAll(/^\s*-\s+\[([ x~?])\]\s+(.+)$/gm)].map(
        ([, marker, text]) => ({
          text: text.trim(),
          state: marker === 'x' ? 'complete' : 'incomplete',
          status: { ' ': 'Todo', '~': 'Doing', '?': 'Review', x: 'Done' }[marker],
        }),
      );

      return { filename, status, scope, content, title, owner, items };
    })
    .filter(Boolean);
}

function normalizeChecklistName(name) {
  return name.replace(/^\[(Todo|Doing|Review|Done)\]\s*/i, '').trim();
}

function cardDescription(task) {
  const introduction = task.content.split(/^##\s+/m)[0].trim();
  return [
    introduction,
    '',
    '---',
    `Synced from \`${task.filename}\`. Edit the local Markdown, not this card.`,
    `<!-- ${MANAGED_MARKER}: ${task.scope} -->`,
  ].join('\n');
}

async function ensureBoard() {
  const boards = await trelloFetch('/members/me/boards', {
    params: { fields: 'name,closed' },
  });
  let board = boards.find((candidate) => candidate.name === boardName && !candidate.closed);

  if (!board) {
    board = await trelloFetch('/boards', {
      method: 'POST',
      params: { name: boardName, defaultLists: false },
    });
    console.log(`Created board "${boardName}".`);
  }

  return board;
}

async function ensureLists(boardId) {
  const existingLists = await trelloFetch(`/boards/${boardId}/lists`, {
    params: { fields: 'name,closed' },
  });
  const listIds = {};

  for (const listName of Object.values(STATUS_LISTS)) {
    let list = existingLists.find((candidate) => candidate.name === listName && !candidate.closed);
    if (!list) {
      list = await trelloFetch(`/boards/${boardId}/lists`, {
        method: 'POST',
        params: { name: listName, pos: 'bottom' },
      });
      console.log(`Created list "${listName}".`);
    }
    listIds[listName] = list.id;
  }

  return listIds;
}

async function syncChecklist(cardId, cardChecklists, task) {
  let checklist = cardChecklists.find((candidate) => candidate.name === 'Line Items');
  if (!checklist) {
    checklist = await trelloFetch(`/cards/${cardId}/checklists`, {
      method: 'POST',
      params: { name: 'Line Items' },
    });
  }

  const existingItems = checklist.checkItems || [];
  const matchedIds = new Set();

  for (let index = 0; index < task.items.length; index += 1) {
    const localItem = task.items[index];
    const cleanName = normalizeChecklistName(localItem.text);
    const desiredName = `[${localItem.status}] ${cleanName}`;
    const match = existingItems.find(
      (item) => !matchedIds.has(item.id) && normalizeChecklistName(item.name) === cleanName,
    );

    if (!match) {
      await trelloFetch(`/checklists/${checklist.id}/checkItems`, {
        method: 'POST',
        params: {
          name: desiredName,
          checked: localItem.state === 'complete',
          pos: index + 1,
        },
      });
      continue;
    }

    matchedIds.add(match.id);
    if (match.name !== desiredName || match.state !== localItem.state) {
      await trelloFetch(`/cards/${cardId}/checkItem/${match.id}`, {
        method: 'PUT',
        params: { name: desiredName, state: localItem.state, pos: index + 1 },
      });
    }
  }

  for (const item of existingItems) {
    if (!matchedIds.has(item.id)) {
      await trelloFetch(`/checklists/${checklist.id}/checkItems/${item.id}`, {
        method: 'DELETE',
      });
    }
  }
}

async function main() {
  console.log(`Synchronizing Markdown tasks with Trello board "${boardName}"...`);

  const board = await ensureBoard();
  const listIds = await ensureLists(board.id);
  const cards = await trelloFetch(`/boards/${board.id}/cards`, {
    params: { checklists: 'all', fields: 'name,desc,idList,closed' },
  });
  const tasks = parseTasks();
  const processedCardIds = new Set();

  for (const task of tasks) {
    const marker = `<!-- ${MANAGED_MARKER}: ${task.scope} -->`;
    const listId = listIds[STATUS_LISTS[task.status]];
    const description = cardDescription(task);
    let card = cards.find((candidate) => candidate.desc?.includes(marker));

    if (!card) {
      card = await trelloFetch('/cards', {
        method: 'POST',
        body: { name: task.title, desc: description, idList: listId },
      });
      card.checklists = [];
      console.log(`Created card "${task.title}".`);
    } else if (
      card.name !== task.title ||
      card.desc !== description ||
      card.idList !== listId ||
      card.closed
    ) {
      card = await trelloFetch(`/cards/${card.id}`, {
        method: 'PUT',
        body: {
          name: task.title,
          desc: description,
          idList: listId,
          closed: false,
        },
      });
      card.checklists ||= await trelloFetch(`/cards/${card.id}/checklists`);
      console.log(`Updated card "${task.title}".`);
    }

    processedCardIds.add(card.id);
    await syncChecklist(card.id, card.checklists || [], task);
  }

  for (const card of cards) {
    if (
      !card.closed &&
      card.desc?.includes(`<!-- ${MANAGED_MARKER}:`) &&
      !processedCardIds.has(card.id)
    ) {
      await trelloFetch(`/cards/${card.id}`, {
        method: 'PUT',
        body: { closed: true },
      });
      console.log(`Archived managed card "${card.name}" because its local task is absent.`);
    }
  }

  console.log(`Sync complete: ${tasks.length} local task(s).`);
}

main().catch((error) => {
  console.error(`Trello sync failed: ${error.message}`);
  process.exit(1);
});
