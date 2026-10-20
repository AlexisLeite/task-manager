import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '../server/auth.js';

process.umask(0o077);
try {
  const path = resolve(process.env.WORKTRACK_DB || '/var/lib/worktrack/worktrack.sqlite');
  if (!existsSync(path)) throw Error('La base no existe; no se creará una base vacía.');
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk.toString('utf8');
    if (Buffer.byteLength(password) > 4096) throw Error('Contraseña demasiado larga.');
  }
  if ([...password].length < 12) throw Error('Usá al menos 12 caracteres.');
  const hash = hashPassword(password);
  password = '';
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=10000');
    const user = db.prepare('SELECT id FROM users WHERE username=?').get('alexis');
    if (!user) throw Error('No existe el usuario alexis.');
    const snapshot = `${path}.before-password-${Date.now()}.sqlite`;
    db.prepare('VACUUM INTO ?').run(snapshot);
    chmodSync(snapshot, 0o600);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    console.log('Contraseña de alexis actualizada. Sus sesiones anteriores fueron cerradas.');
    console.log(`Respaldo previo: ${snapshot}`);
  } finally { db.close(); }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
