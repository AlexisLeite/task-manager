import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeDayPortions } from '../src/overnight.js';
import { document as empty, union } from '../src/model.js';

test('eliminar quita solo las horas de las tareas seleccionadas y conserva paralelas e históricos', () => {
  const tasks = [{id:'a'}, {id:'b'}];
  const actual = {...empty(), tasks, blocks:[
    {id:'shared', taskIds:['a','b'], start:'09:00', end:'10:00'},
    {id:'only-a', taskIds:['a'], start:'10:00', end:'19:25'},
  ]};
  const workspace = {version:2, tasks:[], days:{
    '2026-11-11':{plan:empty(), actual:structuredClone(actual)},
    '2026-11-12':{plan:{...empty(), tasks:[{id:'a'}], blocks:[{id:'p', taskIds:['a'], start:'09:00', end:'19:25'}]}, actual},
  }};
  const before = structuredClone(workspace);
  const result = removeDayPortions(workspace, '2026-11-12', new Set(['a']));
  assert.deepEqual(result.days['2026-11-11'], before.days['2026-11-11']);
  assert.deepEqual(result.days['2026-11-12'].actual.tasks, [{id:'b'}]);
  assert.deepEqual(result.days['2026-11-12'].actual.blocks, [{id:'shared', taskIds:['b'], start:'09:00', end:'10:00'}]);
  assert.equal(union(result.days['2026-11-12'].actual.blocks), 60);
  assert.equal(result.days['2026-11-12'].plan.tasks.length, 0);
  assert.deepEqual(workspace, before, 'keeps the undo snapshot intact');
});

test('eliminar una porción nocturna conserva las horas y planificación de la otra jornada', () => {
  const workspace = {version:2, tasks:[], days:{
    '2026-11-11':{
      plan:{...empty(), tasks:[{id:'a',code:'t1'}], blocks:[{id:'p', taskIds:['a'], start:'21:00', end:'02:00',endDay:1}]},
      actual:{...empty(), tasks:[{id:'a'}], blocks:[{id:'r1',taskIds:['a'],start:'21:00',end:'24:00'}]},
    },
    '2026-11-12':{plan:empty(), actual:{...empty(), tasks:[{id:'a'}], blocks:[{id:'r2',taskIds:['a'],start:'00:00',end:'02:00'}]}},
  }};
  const result = removeDayPortions(workspace, '2026-11-12', new Set(['a']));
  assert.deepEqual(result.days['2026-11-11'].actual, workspace.days['2026-11-11'].actual);
  assert.equal(result.days['2026-11-11'].plan.blocks[0].end, '00:00');
  assert.equal(result.days['2026-11-12'].actual.blocks.length, 0);
});
