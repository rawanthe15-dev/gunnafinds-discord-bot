import test from "node:test";
import assert from "node:assert/strict";
import {
  createSearchSession,
  getSearchSession,
  updateSearchSession,
} from "./search-session.js";

test("search sessions keep query state out of Discord component ids", () => {
  const token = createSearchSession({
    query: "jordan 4 black cat",
    qcOnly: true,
    ownerId: "user-1",
  });

  assert.match(token, /^[a-f0-9]{20}$/);
  const session = getSearchSession(token);
  assert.equal(session.query, "jordan 4 black cat");
  assert.equal(session.qcOnly, true);
  assert.equal(session.ownerId, "user-1");
  assert.equal(typeof session.expiresAt, "number");

  const updated = updateSearchSession(token, { qcOnly: false });
  assert.equal(updated.qcOnly, false);
  assert.equal(getSearchSession("missing"), null);
});
