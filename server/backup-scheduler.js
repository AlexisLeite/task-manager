import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { defaultDatabase } from './database.js';

export const backupInterval = 15 * 60 * 1000;

export function attachDatabaseBackups(server, {
  database = defaultDatabase(),
  cwd = process.cwd(),
  launch = spawn,
  log = console,
} = {}) {
  // Never publish isolated test databases or a different workspace's database.
  if (!server || resolve(database) !== resolve(cwd, 'data/worktrack.sqlite')) return () => {};
  let timer, child, stopped = false;
  const tick = () => {
    if (stopped || child) return;
    // Git/network operations run outside the server's event loop.
    child = launch(process.execPath, [resolve(cwd, 'server/backup-database.js')], {
      cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', chunk => log.info(`[SQLite backup] ${String(chunk).trim()}`));
    child.stderr?.on('data', chunk => log.error(`[SQLite backup] ${String(chunk).trim()}`));
    child.on('error', error => log.error(`[SQLite backup] ${error.message}`));
    child.on('close', code => {
      child = null;
      if (!stopped && code !== 0) log.error(`[SQLite backup] Falló (${code}); se reintentará en 15 minutos.`);
    });
  };
  const start = () => {
    if (stopped || timer) return;
    timer = setInterval(tick, backupInterval);
    timer.unref();
    log.info('[SQLite backup] Activado cada 15 minutos mientras el servidor esté iniciado.');
  };
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    server.off('listening', start);
    child?.kill();
  };
  server.once('close', stop);
  if (server.listening) start();
  else server.once('listening', start);
  return stop;
}
