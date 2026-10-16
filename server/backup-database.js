import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A separate, database-only branch keeps the working tree and staging area untouched.
export function backupDatabase({ cwd = process.cwd(), database = resolve(cwd, 'data/worktrack.sqlite'), remote = 'origin', branch = 'sqlite-backup' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'worktrack-backup-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, 'index'), GIT_TERMINAL_PROMPT: '0' };
  const git = (args, input) => execFileSync('git', args, { cwd, env, input, encoding: 'utf8', timeout: 120000, windowsHide: true }).trim();
  try {
    const snapshot = join(directory, 'worktrack.sqlite');
    const db = new DatabaseSync(database, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout=10000');
      // VACUUM INTO includes committed WAL changes without touching the live database.
      db.prepare('VACUUM INTO ?').run(snapshot);
    } finally { db.close(); }
    const check = new DatabaseSync(snapshot, { readOnly: true });
    try {
      if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
        throw new Error('La copia SQLite no superó integrity_check.');
    } finally { check.close(); }
    const ref = `refs/heads/${branch}`;
    git(['check-ref-format', ref]);
    const found = git(['ls-remote', '--heads', remote, ref]);
    let parent;
    if (found) {
      parent = found.split(/\s+/)[0];
      git(['fetch', '--no-tags', '--no-write-fetch-head', remote, ref]);
      const files = git(['ls-tree', '--name-only', parent]).split('\n');
      if (files.length !== 1 || files[0] !== 'worktrack.sqlite')
        throw new Error('La rama de respaldo contiene archivos ajenos a SQLite.');
    }
    const blob = git(['hash-object', '-w', '--stdin'], readFileSync(snapshot));
    if (parent && git(['rev-parse', `${parent}:worktrack.sqlite`]) === blob)
      return { changed: false, commit: parent };
    git(['read-tree', '--empty']);
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},worktrack.sqlite`]);
    const tree = git(['write-tree']);
    const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Backup SQLite ${new Date().toISOString()}`]);
    // No force: a competing backup cannot overwrite a newer remote commit.
    git(['push', remote, `${commit}:${ref}`]);
    return { changed: true, commit };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = backupDatabase();
    console.log(result.changed ? `SQLite respaldada: ${result.commit}` : 'SQLite sin cambios; no se creó un commit.');
  } catch (error) {
    console.error(`No se pudo respaldar SQLite: ${error.message}`);
    process.exitCode = 1;
  }
}
