import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validate } from "../src/model.js";
import { hashPassword, verifyPassword, sessionHash, newToken, sessionLifetime } from "./auth.js";

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
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    );`);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT id FROM users WHERE id=1").get())
      db.prepare("INSERT INTO users VALUES(1,?,?)").run("alexis", hashPassword("alexis123"));
    if (!db.prepare("PRAGMA table_info(workspace)").all().some(column => column.name === "user_id")) {
      db.exec("ALTER TABLE workspace ADD COLUMN user_id INTEGER REFERENCES users(id)");
      db.exec("UPDATE workspace SET user_id=1 WHERE user_id IS NULL");
    }
    db.exec("PRAGMA user_version=2; COMMIT");
  } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  const read = (userId = 1) => {
    const row = db
      .prepare("SELECT document, revision FROM workspace WHERE id=1 AND user_id=?")
      .get(userId);
    return row
      ? { data: JSON.parse(row.document), revision: row.revision }
      : { data: { version: 2, days: {}, tasks: [] }, revision: 0 };
  };
  const write = (data, expected, seed = false, userId = 1) => {
    if (userId !== 1) throw Object.assign(Error("Acceso no permitido"), { status: 403 });
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
        "INSERT INTO workspace(id,document,revision,updated_at,user_id) VALUES(1,?,?,?,1) ON CONFLICT(id) DO UPDATE SET document=excluded.document, revision=excluded.revision, updated_at=excluded.updated_at",
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
    async login(username, password) {
      const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
      const fallback = db.prepare("SELECT password_hash FROM users WHERE id=1").get();
      const valid = await verifyPassword(password, user?.password_hash || fallback.password_hash);
      if (!user || !valid) return null;
      const token = newToken();
      db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(sessionHash(token), user.id, Date.now() + sessionLifetime);
      return { token, user: { id: user.id, username: user.username } };
    },
    session(token) {
      if (!token) return null;
      return db.prepare("SELECT users.id, users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?").get(sessionHash(token), Date.now()) || null;
    },
    logout(token) {
      if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sessionHash(token));
    },
    read,
    write,
    seed: (data) => write(data, 0, true),
    close: () => db.close(),
  };
}
