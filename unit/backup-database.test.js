import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDatabase } from '../server/backup-database.js';

test('respalda WAL, omite datos sin cambios y conserva staging y rama de trabajo', () => {
  const root = mkdtempSync(join(tmpdir(), 'worktrack-backup-test-'));
  const cwd = join(root, 'repo'), remote = join(root, 'remote.git');
  mkdirSync(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, encoding:'utf8', windowsHide:true }).trim();
  let db;
  try {
    git('init', '--bare', remote);
    git('init', '-b', 'main');
    git('config', 'user.name', 'Backup Test');
    git('config', 'user.email', 'backup@example.test');
    writeFileSync(join(cwd, 'code.txt'), 'initial');
    git('add', 'code.txt'); git('commit', '-m', 'initial');
    git('remote', 'add', 'origin', remote);
    writeFileSync(join(cwd, 'code.txt'), 'staged code'); git('add', 'code.txt');
    const staged = git('diff', '--cached'), head = git('rev-parse', 'HEAD');
    const database = join(root, 'live.sqlite');
    db = new DatabaseSync(database);
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('first');");
    const first = backupDatabase({cwd,database});
    assert.equal(first.changed,true);
    assert.equal(backupDatabase({cwd,database}).changed,false);
    db.exec("INSERT INTO sample VALUES('from WAL');");
    const second = backupDatabase({cwd,database});
    assert.equal(second.changed,true);
    assert.notEqual(second.commit,first.commit);
    assert.equal(git('ls-tree','--name-only',second.commit),'worktrack.sqlite');
    const restored = join(root,'restored.sqlite');
    writeFileSync(restored,execFileSync('git',['show',`${second.commit}:worktrack.sqlite`],{cwd,windowsHide:true}));
    const check = new DatabaseSync(restored,{readOnly:true});
    try { assert.deepEqual(check.prepare('SELECT value FROM sample').all().map(r=>r.value),['first','from WAL']); }
    finally { check.close(); }
    assert.equal(git('diff','--cached'),staged);
    assert.equal(git('rev-parse','HEAD'),head);
    assert.equal(git('branch','--show-current'),'main');
  } finally {
    db?.close();
    rmSync(root,{recursive:true,force:true});
  }
});
