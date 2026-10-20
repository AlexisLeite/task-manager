import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { openStore } from "../server/database.js";
import { api } from "../server/api.js";
import { example } from "../src/model.js";
import { BackendAdapter, Repository } from "../src/storage.js";

test("SQLite conserva el seed íntegro y los cambios después de cerrar y abrir; no permite reseed", () => {
  const dir = mkdtempSync(join(tmpdir(), "worktrack-unit-")),
    path = join(dir, "test.sqlite");
  const data = {
    version: 2,
    days: { "2026-10-15": { plan: example(), actual: null } },
    tasks: [],
    custom: { preserved: true },
  };
  let store = openStore(path);
  try {
    store.seed(data);
    assert.deepEqual(store.read().data, data);
    assert.throws(() => store.seed(data), { status: 409 });
    data.days["2026-10-15"].plan.tasks[0].name = "Cambio persistido";
    store.write(data, 1);
    store.close();
    store = openStore(path);
    assert.deepEqual(store.read(), { data, revision: 2 });
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});

test("API y adaptador guardan, rechazan datos inválidos y bloquean escrituras de pestañas desactualizadas", async () => {
  const store = openStore(":memory:"),
    server = createServer(api(store));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/workspace`;
  const originalFetch = globalThis.fetch;
  const login = await originalFetch(url.replace("/workspace", "/login"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alexis", password: "alexis123" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  globalThis.fetch = (input, options = {}) => originalFetch(input, {
    ...options, headers: { ...options.headers, Cookie: cookie },
  });
  try {
    const one = new Repository(new BackendAdapter(url)),
      two = new BackendAdapter(url);
    const doc = await one.load();
    await two.load();
    doc.days["2026-10-15"] = { plan: example(), actual: null };
    await one.save(doc);
    await assert.rejects(two.save({ ...doc, tasks: [] }), /otra pestaña/);
    const staleRevision = two.revision;
    const update = await two.poll();
    assert.deepEqual(update.data, doc);
    assert.equal(
      two.revision,
      staleRevision,
      "poll does not acknowledge data before the UI accepts it",
    );
    two.revision = update.revision;
    assert.equal(await two.poll(), null);
    assert.deepEqual(store.read().data, doc);
    const invalid = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: "{}",
    });
    assert.equal(invalid.status, 400);
    assert.equal(store.read().revision, 1);
    const missing = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    assert.equal(missing.status, 428);
    const foreign = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": '"1"',
        Origin: "https://example.com",
      },
      body: JSON.stringify(doc),
    });
    assert.equal(foreign.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});
