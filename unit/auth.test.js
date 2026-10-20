import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../server/database.js";

test("migra la base anterior sin cambiar el documento, la revisión ni el respaldo y asigna alexis", async () => {
  const dir = mkdtempSync(join(tmpdir(), "worktrack-auth-"));
  const path = join(dir, "old.sqlite");
  const document = JSON.stringify({ version: 2, days: {}, tasks: [], historical: { preserved: true } });
  const legacy = new DatabaseSync(path);
  legacy.exec("CREATE TABLE workspace(id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE seed_backup(id INTEGER PRIMARY KEY, document TEXT NOT NULL, imported_at TEXT NOT NULL); PRAGMA user_version=1;");
  legacy.prepare("INSERT INTO workspace VALUES(1,?,7,'original')").run(document);
  legacy.prepare("INSERT INTO seed_backup VALUES(1,?,'original')").run(document);
  legacy.close();
  let store;
  try {
    store = openStore(path);
    assert.deepEqual(store.read(), { data: JSON.parse(document), revision: 7 });
    assert.equal(await store.login("alexis", "incorrecta"), null);
    assert.equal(await store.login("otro", "alexis123"), null);
    const login = await store.login("alexis", "alexis123");
    assert.equal(store.session(login.token).username, "alexis");
    assert.equal(store.session("inventada"), null);
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT user_id FROM workspace").get().user_id, login.user.id);
    assert.equal(check.prepare("SELECT document FROM workspace").get().document, document);
    assert.equal(check.prepare("SELECT document FROM seed_backup").get().document, document);
    assert.ok(!check.prepare("SELECT password_hash FROM users").get().password_hash.includes("alexis123"));
    assert.equal(store.read(999).revision, 0);
    assert.throws(() => store.write(JSON.parse(document), 7, false, 999), { status: 403 });
    check.prepare("UPDATE sessions SET expires_at=0").run();
    assert.equal(store.session(login.token), null);
    check.close();
    store.close();
    store = openStore(path);
    assert.equal(store.read().revision, 7);
    const next = await store.login("alexis", "alexis123");
    store.logout(next.token);
    assert.equal(store.session(next.token), null);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
