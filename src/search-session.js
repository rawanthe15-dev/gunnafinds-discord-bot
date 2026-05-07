import { randomUUID } from "node:crypto";

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map();

function compactSessions(now = Date.now()) {
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

export function createSearchSession({ query, qcOnly, ownerId }) {
  compactSessions();
  const token = randomUUID().replace(/-/g, "").slice(0, 20);
  sessions.set(token, {
    query,
    qcOnly,
    ownerId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function getSearchSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

export function updateSearchSession(token, patch) {
  const session = getSearchSession(token);
  if (!session) return null;
  Object.assign(session, patch);
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}
