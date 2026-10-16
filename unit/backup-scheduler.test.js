import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { attachDatabaseBackups, backupInterval } from '../server/backup-scheduler.js';

test('respalda cada 15 minutos solamente mientras el servidor escucha, sin solaparse', t => {
  t.mock.timers.enable({apis:['setInterval']});
  const server = new EventEmitter(), children = [];
  const launch = (...args) => {
    const child = new EventEmitter();
    child.kill = () => { child.killed = true; };
    child.args = args;
    children.push(child);
    return child;
  };
  attachDatabaseBackups(server,{database:resolve('data/worktrack.sqlite'),launch,log:{info(){},error(){}}});
  t.mock.timers.tick(backupInterval * 2);
  assert.equal(children.length,0);
  server.emit('listening');
  t.mock.timers.tick(backupInterval - 1);
  assert.equal(children.length,0);
  t.mock.timers.tick(1);
  assert.equal(children.length,1);
  assert.equal(children[0].args[2].windowsHide,true);
  t.mock.timers.tick(backupInterval);
  assert.equal(children.length,1);
  children[0].emit('close',1);
  t.mock.timers.tick(backupInterval);
  assert.equal(children.length,2);
  server.emit('close');
  assert.equal(children[1].killed,true);
  t.mock.timers.tick(backupInterval * 3);
  assert.equal(children.length,2);
});

test('no publica bases de pruebas ni bases alternativas', t => {
  t.mock.timers.enable({apis:['setInterval']});
  const server = new EventEmitter();
  attachDatabaseBackups(server,{database:resolve('data/test.sqlite'),launch(){assert.fail('No debe ejecutar backup');}});
  server.emit('listening');
  t.mock.timers.tick(backupInterval * 3);
});
