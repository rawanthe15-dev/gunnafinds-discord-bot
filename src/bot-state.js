import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE = {
  announcements: { postedIds: [] },
  updates: { catalogTotal: null, newestProductId: null },
  finds: { postedIds: [], page: 1 },
  sticky: { w2cMessageId: null, findsMessageId: null },
  activity: { users: {} },
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function normalizeState(value) {
  const state = cloneDefaultState();
  if (!value || typeof value !== "object") return state;
  return {
    announcements: {
      postedIds: Array.isArray(value.announcements?.postedIds)
        ? value.announcements.postedIds.slice(0, 500)
        : [],
    },
    updates: {
      catalogTotal: Number.isFinite(value.updates?.catalogTotal)
        ? value.updates.catalogTotal
        : null,
      newestProductId:
        typeof value.updates?.newestProductId === "string"
          ? value.updates.newestProductId
          : null,
    },
    finds: {
      postedIds: Array.isArray(value.finds?.postedIds)
        ? value.finds.postedIds.slice(0, 700)
        : [],
      page: Math.max(1, Number.parseInt(value.finds?.page ?? "1", 10) || 1),
    },
    sticky: {
      w2cMessageId:
        typeof value.sticky?.w2cMessageId === "string"
          ? value.sticky.w2cMessageId
          : null,
      findsMessageId:
        typeof value.sticky?.findsMessageId === "string"
          ? value.sticky.findsMessageId
          : null,
    },
    activity: {
      users:
        value.activity?.users && typeof value.activity.users === "object"
          ? value.activity.users
          : {},
    },
  };
}

export async function loadBotState(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") return cloneDefaultState();
    throw error;
  }
}

export async function saveBotState(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalizeState(state), null, 2)}\n`);
}

export function rememberId(list, id, limit = 500) {
  if (!id) return list;
  const next = [id, ...list.filter((item) => item !== id)];
  return next.slice(0, limit);
}

export function addActivity(state, userId, kind, points = 1) {
  const users = state.activity.users;
  const current = users[userId] ?? {
    score: 0,
    messages: 0,
    finds: 0,
    buttons: 0,
    roles: [],
  };
  current.score += points;
  if (kind === "message") current.messages += 1;
  if (kind === "find") current.finds += 1;
  if (kind === "button") current.buttons += 1;
  users[userId] = current;
  return current;
}
