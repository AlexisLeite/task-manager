import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/database.js';

test('cambiar contraseña conserva datos, respalda el estado anterior y revoca sesiones', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'worktrack-password-'));
  const path = join(directory, 'test.sqlite');
  const store = openStore(path);
  try {
    store.seed({ version: 2, days: {}, tasks: [], historical: { preserved: true } });
    const session = await store.login('alexis', 'alexis123');
    const before = store.read();
    const invoke = input => spawnSync(process.execPath, [resolve('scripts/change-password.mjs')], {
      env: { ...process.env, WORKTRACK_DB: path }, input, encoding: 'utf8',
    });
    assert.equal(invoke('short').status, 1);
    assert.ok(store.session(session.token));
    const result = invoke('contraseña de prueba nueva');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(store.session(session.token), null);
    assert.equal(await store.login('alexis', 'alexis123'), null);
    assert.ok(await store.login('alexis', 'contraseña de prueba nueva'));
    assert.deepEqual(store.read(), before);
    const backupPath = readdirSync(directory).find(name => name.includes('.before-password-'));
    const backup = new DatabaseSync(join(directory, backupPath), { readOnly: true });
    try {
      assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(backup.prepare('SELECT count(*) AS n FROM sessions').get().n, 1);
      assert.deepEqual(JSON.parse(backup.prepare('SELECT document FROM workspace').get().document), before.data);
      assert.equal(backup.prepare('SELECT count(*) AS n FROM seed_backup').get().n, 1);
    } finally { backup.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
