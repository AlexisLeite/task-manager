import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shiftAgenda} from '../src/time-control.js';
import {document as empty,task,block,duration} from '../src/model.js';
import {refreshContinuations,canonicalWorkspace} from '../src/overnight.js';
test('pausa cruza medianoche, mueve futuras, mantiene identidad, paralelos y realizado',()=>{
  const plan=empty(), next=empty();
  for(const [name,start,end,endDay,state] of [['pasada','18:00','19:00',0],['activa','22:00','00:00',1],['paralela','22:30','23:30',0],['futura','23:30','00:30',1],['terminada','22:00','23:00',0,'finished']]) {
    const t={...task(plan.tasks),name};plan.tasks.push(t);
    plan.blocks.push({...block(),taskIds:[t.id],start,end,endDay,focusStates:state?{[t.id]:state}:{}});
  }
  const existing={...task([]),name:'Mañana'};next.tasks.push(existing);next.blocks.push({...block(),taskIds:[existing.id],start:'10:00',end:'11:00'});
  const workspace={version:2,tasks:[],days:{'2026-10-16':{plan,actual:structuredClone(plan)},'2026-10-17':{plan:next,actual:null}}};
  const original=structuredClone(workspace);
  refreshContinuations(workspace);
  const moved=shiftAgenda(workspace,new Date('2026-10-16T23:00:00').getTime(),new Date('2026-10-17T01:00:00').getTime());
  assert.deepEqual(workspace.days['2026-10-16'].actual,original.days['2026-10-16'].actual);
  assert.deepEqual(moved.days['2026-10-16'].actual,original.days['2026-10-16'].actual);
  assert.equal(moved.days['2026-10-16'].plan.tasks.length,2);
  const tomorrow=moved.days['2026-10-17'].plan;
  assert.equal(new Set(tomorrow.tasks.map(t=>t.code)).size,tomorrow.tasks.length);
  for(const [name,start,end] of [['activa','00:00','02:00'],['paralela','00:30','01:30'],['futura','01:30','02:30'],['Mañana','10:00','11:00']]) {
    const t=tomorrow.tasks.find(t=>t.name===name),b=tomorrow.blocks.find(b=>b.taskIds.includes(t.id));
    assert.equal(b.start,start);assert.equal(b.end,end);
    const originalBlock=Object.values(original.days).flatMap(d=>d.plan.blocks).find(row=>row.id===b.id);
    assert.equal(duration(b),duration(originalBlock));
  }
  refreshContinuations(moved);assert.deepEqual(canonicalWorkspace(moved).days['2026-10-17'].plan.tasks,tomorrow.tasks);
});

test('un bloque compartido desplaza solo las tareas pendientes y conserva las finalizadas',()=>{
 const plan=empty(), a={...task([]),name:'Pendiente'}, b={...task([]),name:'Hecha'};
 plan.tasks=[a,b];const shared={...block(),taskIds:[a.id,b.id],start:'09:00',end:'11:00',focusStates:{[b.id]:'finished'}};plan.blocks=[shared];
 const data={version:2,tasks:[],days:{'2026-10-16':{plan,actual:null}}};
 const shifted=shiftAgenda(data,new Date('2026-10-16T10:00:00').getTime(),new Date('2026-10-16T10:30:00').getTime());
 const rows=shifted.days['2026-10-16'].plan.blocks;
 assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.id)).size,2);
 assert.equal(rows.find(row=>row.taskIds.includes(a.id)).start,'09:30');
 assert.equal(rows.find(row=>row.taskIds.includes(b.id)).start,'09:00');
 assert.equal(data.days['2026-10-16'].plan.blocks[0].taskIds.length,2);
});
