import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validate } from "../src/model.js";

export const defaultDatabase = () =>
  resolve(process.env.WORKTRACK_DB || "data/worktrack.sqlite");
export function openStore(path = defaultDatabase()) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS workspace (
      id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL CHECK(json_valid(document)),
      revision INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seed_backup (
      id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL, imported_at TEXT NOT NULL
    );
    PRAGMA user_version=1;`);
  const read = () => {
    const row = db
      .prepare("SELECT document, revision FROM workspace WHERE id=1")
      .get();
    return row
      ? { data: JSON.parse(row.document), revision: row.revision }
      : { data: { version: 2, days: {}, tasks: [] }, revision: 0 };
  };
  const write = (data, expected, seed = false) => {
    validate(data);
    const json = JSON.stringify(data);
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = read();
      if (current.revision !== expected || (seed && current.revision !== 0)) {
        const error = Error(
          "Los datos cambiaron en otra pestaña. Exportá tus cambios y recargá antes de continuar.",
        );
        error.status = 409;
        throw error;
      }
      const revision = current.revision + 1,
        now = new Date().toISOString();
      db.prepare(
        "INSERT INTO workspace VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, revision=excluded.revision, updated_at=excluded.updated_at",
      ).run(json, revision, now);
      if (seed)
        db.prepare("INSERT INTO seed_backup VALUES(1,?,?)").run(json, now);
      db.exec("COMMIT");
      return revision;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  return {
    read,
    write,
    seed: (data) => write(data, 0, true),
    close: () => db.close(),
  };
}
