import {test,expect} from '@playwright/test';
import {document as empty,task,block} from '../src/model.js';
async function setup(page,now='2026-10-16T10:00:00') {
  await page.clock.install({time:new Date(now)});
  await page.clock.pauseAt(new Date(now));
  const plan=empty();
  for(const [name,start,end] of [['Anterior','08:00','09:00'],['Activa','09:00','11:00'],['Paralela','09:30','10:30'],['Futura','12:00','13:00']]) {
    const t={...task(plan.tasks),name,estimate: name==='Activa'?'02:00':'01:00'};
    plan.tasks.push(t);plan.blocks.push({...block(),taskIds:[t.id],start,end});
  }
  await page.addInitScript(data=>{if(!localStorage.getItem('jornada.v1'))localStorage.setItem('jornada.v1',JSON.stringify(data));},{version:2,tasks:[],days:{'2026-10-16':{plan,actual:null}}});
  await page.goto('/#/jornada');
}
async function stored(page) { await expect(page.locator('#saved')).toHaveText('Guardado');return page.evaluate(()=>JSON.parse(localStorage.getItem('jornada.v1'))); }
function intervals(data,key='2026-10-16') {const p=data.days[key].plan;return Object.fromEntries(p.blocks.map(b=>[p.tasks.find(t=>b.taskIds.includes(t.id)).name,[b.start,b.end]]));}
test('reanudar crea instancias nuevas y conserva el trabajo anterior a la pausa',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Pausar el tiempo',exact:true}).click();
  await page.clock.fastForward(30*60000);
  await expect(page.locator('#app-clock')).toHaveText('10:00:00');
  await page.reload();
  await expect(page.getByRole('button',{name:'Reanudar el tiempo',exact:true})).toBeVisible();
  await expect(page.locator('#app-clock')).toHaveText('10:00:00');
  await page.getByRole('button',{name:'Reanudar el tiempo',exact:true}).click();
  const data=await stored(page);
  expect(intervals(data)).toEqual({Anterior:['08:00','09:00'],Activa:['10:30','11:30'],Paralela:['10:30','11:00'],Futura:['12:30','13:30']});
  const {plan,actual}=data.days['2026-10-16'];
  expect(plan.tasks).toHaveLength(6);
  expect(actual.blocks.map(row=>[row.start,row.end]).sort()).toEqual([['09:00','10:00'],['09:30','10:00']]);
  for (const name of ['Activa','Paralela']) {
    const instances=plan.tasks.filter(task=>task.name===name);
    expect(instances).toHaveLength(2);
    expect(instances[0].id).not.toBe(instances[1].id);
    expect(instances[0].taskId).toBe(instances[1].taskId);
    const old=plan.blocks.find(row=>row.taskIds.includes(instances[0].id));
    expect(old.end).toBe('10:00');
    expect(old.focusStates[instances[0].id]).toBe('finished');
  }
  await expect(page.locator('#app-clock')).toHaveText('10:30:00');
  await expect(page.locator('#total')).toHaveText('Trabajado: 2:00 hs');
  await page.clock.fastForward(15*60000);
  await page.getByRole('button',{name:'Pausar el tiempo',exact:true}).click();
  await page.clock.fastForward(30*60000);
  await page.getByRole('button',{name:'Reanudar el tiempo',exact:true}).click();
  const repeated=await stored(page);
  expect(repeated.days['2026-10-16'].plan.tasks).toHaveLength(8);
  expect(repeated.days['2026-10-16'].actual.blocks.slice(0,2)).toEqual(actual.blocks);
  expect(repeated.days['2026-10-16'].actual.blocks.slice(2).map(row=>[row.start,row.end])).toEqual([['10:30','10:45'],['10:30','10:45']]);
  expect(intervals(repeated)).toMatchObject({Activa:['11:15','12:00'],Paralela:['11:15','11:30'],Futura:['13:00','14:00']});
  await expect(page.locator('#total')).toHaveText('Trabajado: 2:15 hs');
});

test('pausa de tarea abierta atraviesa medianoche sin mover ni reemplazar el primer tramo',async({page})=>{
  await page.clock.install({time:new Date('2026-10-16T23:30:00')});
  await page.clock.pauseAt(new Date('2026-10-16T23:30:00'));
  const plan=empty(), t={...task([]),name:'Trabajo nocturno',projectId:'p'};
  plan.tasks.push(t);plan.blocks.push({...block(),taskIds:[t.id],start:'23:00',end:'',openStarted:true});
  await page.addInitScript(data=>{if(!localStorage.getItem('jornada.v1'))localStorage.setItem('jornada.v1',JSON.stringify(data));},
    {version:2,tasks:[],projects:[{id:'p',name:'POC'}],days:{'2026-10-16':{plan,actual:null}}});
  await page.goto('/#/foco');
  await page.getByRole('button',{name:'Pausar el tiempo',exact:true}).click();
  await page.clock.fastForward(3600000);
  await page.reload();
  await page.getByRole('button',{name:'Reanudar el tiempo',exact:true}).click();
  let data=await stored(page);
  expect(data.days['2026-10-16'].actual.blocks[0]).toMatchObject({start:'23:00',end:'23:30'});
  const previous=structuredClone(data.days['2026-10-16']);
  const next=data.days['2026-10-17'];
  expect(next.plan.tasks[0]).toMatchObject({name:t.name,taskId:t.taskId,projectId:'p'});
  expect(next.plan.tasks[0].id).not.toBe(t.id);
  expect(next.plan.blocks[0]).toMatchObject({start:'00:30',end:'',openStarted:true});
  await expect(page).toHaveTitle('Work Track - 00:00:00 - POC');
  await page.clock.fastForward(1800000);
  await page.getByRole('listitem').getByLabel('Opciones de Trabajo nocturno',{exact:true}).click();
  await page.getByRole('button',{name:'Terminar tarea',exact:true}).click();
  data=await stored(page);
  expect(data.days['2026-10-16']).toEqual(previous);
  expect(data.days['2026-10-17'].actual.blocks[0]).toMatchObject({start:'00:30',end:'01:00'});
});
test('retroceder abre Foco y previsualiza sin modificar; cancelar restaura',async({page},testInfo)=>{
  await setup(page);
  const before=await stored(page);
  await page.getByRole('button',{name:'Control del tiempo',exact:true}).click();
  await page.clock.runFor(500);
  await expect(page).toHaveURL(/#\/foco$/);
  const dialog=page.locator('dialog[open]');
  await dialog.getByLabel('Hora',{exact:true}).fill('08:30');
  await expect(page.locator('[data-focus-id] h2')).toHaveText(['Anterior']);
  await expect(page.locator('#app-clock')).toHaveText('08:30:00');
  expect(await stored(page)).toEqual(before);
  await dialog.getByLabel('Hora',{exact:true}).dispatchEvent('wheel',{deltaY:100});
  await expect(dialog.getByLabel('Hora',{exact:true})).toHaveValue('08:15');
  await page.clock.runFor(300);
  await expect(page.locator('#focus-content')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('preview.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#app-clock')).toHaveText('10:00:00');
  expect(await stored(page)).toEqual(before);
});
test('confirmar retroceso mueve activas y futuras; no registra horas',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Control del tiempo',exact:true}).click();
  await page.clock.runFor(500);
  const dialog=page.locator('dialog[open]');
  await dialog.getByLabel('Hora',{exact:true}).fill('09:30');
  await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();
  expect(intervals(await stored(page))).toEqual({Anterior:['08:00','09:00'],Activa:['09:30','11:30'],Paralela:['10:00','11:00'],Futura:['12:30','13:30']});
  await expect(page.locator('#app-clock')).toHaveText('10:00:00');
});
test('retroceder durante pausa mantiene la pausa al cancelar y combina los tiempos al confirmar',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Pausar el tiempo',exact:true}).click();
  await page.clock.fastForward(30*60000);
  await page.getByRole('button',{name:'Control del tiempo',exact:true}).click();
  await page.clock.runFor(500);
  let dialog=page.locator('dialog[open]');
  await dialog.getByLabel('Hora',{exact:true}).fill('25:00');
  await expect(dialog.getByRole('alert')).toContainText('válidas');
  await dialog.getByLabel('Hora',{exact:true}).fill('09:30');
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(page.locator('#app-clock')).toHaveText('10:00:00');
  await expect(page.getByRole('button',{name:'Reanudar el tiempo',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Control del tiempo',exact:true}).click();
  dialog=page.locator('dialog[open]');
  await dialog.getByLabel('Hora',{exact:true}).fill('09:30');
  await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();
  const data=await stored(page);
  expect(intervals(data)).toEqual({Anterior:['08:00','09:00'],Activa:['10:00','12:00'],Paralela:['10:30','11:30'],Futura:['13:00','14:00']});
  expect(data.timeControl.pausedAt).toBeNull();
});
