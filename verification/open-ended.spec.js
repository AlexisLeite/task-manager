import {test,expect} from '@playwright/test';
import {document as empty,task,block} from '../src/model.js';
async function setup(page,request,now='2026-10-16T10:00:00') {
 const plan=empty(), t={...task([]),name:'Investigar sin duración'};
 plan.tasks.push(t);plan.blocks.push({...block(),taskIds:[t.id]});
 const next={...task(plan.tasks),name:'Siguiente',estimate:'01:00'};
 plan.tasks.push(next);plan.blocks.push({...block(),taskIds:[next.id],start:'12:00',end:'13:00'});
 const existing=await request.get('/api/workspace');
 expect((await request.put('/api/workspace',{headers:{'If-Match':existing.headers().etag},data:{version:2,tasks:[],days:{'2026-10-16':{plan,actual:null}}}})).ok()).toBeTruthy();
 await page.clock.install({time:new Date(now)});await page.clock.pauseAt(new Date(now));await page.goto('/#/foco');
}
const openRow=page=>page.locator('.focus-card').filter({has:page.getByRole('heading',{name:'Investigar sin duración',exact:true})});
async function menu(page) {await openRow(page).getByRole('heading').click({button:'right'});return openRow(page).locator('.focus-remaining .focus-menu');}
async function read(page,request) {await expect(page.locator('#saved')).toHaveText('Guardado');return (await request.get('/api/workspace')).json();}
async function start(page) {await (await menu(page)).getByRole('button',{name:'Iniciar tarea',exact:true}).click();}

test('pendiente sin duración ofrece definición, iniciar y cancelar por click derecho',async({page,request})=>{
 await setup(page,request);
 await expect(openRow(page)).toHaveClass(/focus-upcoming/);
 await expect(openRow(page).locator('time')).toHaveCount(0);
 const popup=await menu(page);
 await expect(popup.locator('button')).toHaveText(['Ver definición','Iniciar tarea','Cancelar tarea']);
 await popup.getByRole('button',{name:'Ver definición',exact:true}).click();
 await page.clock.runFor(500);
 await expect(page).toHaveURL(/#\/jornada$/);
 await expect(page.getByLabel('Tarea 2: Descripción',{exact:true})).toHaveValue('Investigar sin duración');
});

test('iniciar muestra transcurrido sin barra, persiste y pausa descuenta tiempo real',async({page,request},testInfo)=>{
 await setup(page,request);await start(page);await read(page,request);
 await expect(openRow(page)).not.toHaveClass(/focus-upcoming/);
 await expect(openRow(page).getByLabel('Tiempo transcurrido')).toHaveText('00:00:00');
 await expect(openRow(page).locator('[role=progressbar]')).toHaveCount(0);
 let data=await read(page,request);expect(data.days['2026-10-16'].plan.blocks.find(b=>b.start==='12:00').end).toBe('13:00');
 await page.clock.fastForward(15*60000);await page.reload();
 await expect(openRow(page).getByLabel('Tiempo transcurrido')).toHaveText('00:15:00');
 await page.getByLabel('Pausar el tiempo',{exact:true}).click();await read(page,request);
 await page.clock.fastForward(10*60000);await expect(openRow(page).getByLabel('Tiempo transcurrido')).toHaveText('00:15:00');
 await page.getByLabel('Reanudar el tiempo',{exact:true}).click();await read(page,request);
 await expect(openRow(page).getByLabel('Tiempo transcurrido')).toHaveText('00:15:00');
 await page.clock.fastForward(5*60000);
 await page.screenshot({path:testInfo.outputPath('open-ended.png'),animations:'disabled'});
 await (await menu(page)).getByRole('button',{name:'Terminar tarea',exact:true}).click();
 data=await read(page,request);
 expect(data.days['2026-10-16'].actual.blocks).toHaveLength(1);
 expect(data.days['2026-10-16'].actual.blocks[0]).toMatchObject({start:'10:10',end:'10:30'});
 expect(data.days['2026-10-16'].actual.tasks[0].estimate).toBe('00:20');
 await expect(openRow(page)).toHaveCount(0);
});

for(const started of [false,true])test(`cancelar ${started?'activa':'pendiente'} no registra horas`,async({page,request})=>{
 await setup(page,request);if(started){await start(page);await page.clock.fastForward(10*60000);}
 await (await menu(page)).getByRole('button',{name:'Cancelar tarea',exact:true}).click();
 const data=await read(page,request);expect(data.days['2026-10-16'].actual).toBeNull();
 await expect(openRow(page)).toHaveCount(0);await page.reload();await expect(openRow(page)).toHaveCount(0);
});

test('una tarea abierta sigue activa tras medianoche y reparte horas realizadas',async({page,request})=>{
 await setup(page,request,'2026-10-16T23:30:00');await start(page);await read(page,request);
 await page.clock.fastForward(60*60000);await page.reload();
 await expect(openRow(page).getByLabel('Tiempo transcurrido')).toHaveText('01:00:00');
 await (await menu(page)).getByRole('button',{name:'Terminar tarea',exact:true}).click();
 const data=await read(page,request);
 expect(data.days['2026-10-16'].actual.blocks[0]).toMatchObject({start:'23:30',end:'24:00'});
 expect(data.days['2026-10-17'].actual.blocks[0]).toMatchObject({start:'00:00',end:'00:30'});
});

test('definir duración después de iniciar convierte el contador en tiempo restante',async({page,request})=>{
 await setup(page,request);await start(page);await read(page,request);
 await (await menu(page)).getByRole('button',{name:'Ver definición',exact:true}).click();await page.clock.runFor(500);
 await page.getByLabel('Tarea 1: Duración',{exact:true}).fill('1');
 await page.getByLabel('Tarea 1: Descripción',{exact:true}).focus();await read(page,request);
 await page.getByRole('button',{name:'Foco',exact:true}).click();await page.clock.runFor(500);
 await expect(openRow(page).getByLabel('Tiempo restante',{exact:true})).toHaveText('00:59:59');
 await expect(openRow(page).locator('[role=progressbar]')).toHaveCount(1);
});

test('play aparece en hover a la izquierda de dots e inicia tareas con y sin duración',async({page,request})=>{
 await setup(page,request);
 for(const name of ['Investigar sin duración','Siguiente']) {
  const row=page.locator('.focus-upcoming').filter({has:page.getByRole('heading',{name,exact:true})});
  const play=row.getByRole('button',{name:`Iniciar ${name}`,exact:true});
  await page.mouse.move(1,1);
  await expect(play).toHaveCSS('opacity','0');
  await row.hover();
  await expect(play).toHaveCSS('opacity','1');
  await expect(play).toHaveCSS('color','rgb(50, 168, 82)');
  const buttonBox=await play.boundingBox(),dotsBox=await row.locator('.focus-remaining summary').boundingBox();
  expect(buttonBox.x+buttonBox.width).toBeLessThanOrEqual(dotsBox.x);
  await play.click();
  await expect(page.locator('[data-focus-id]').filter({has:page.getByRole('heading',{name,exact:true})})).toHaveCount(1);
  const saved=await read(page,request),plan=saved.days['2026-10-16'].plan;
  const task=plan.tasks.find(t=>t.name===name),block=plan.blocks.find(b=>b.taskIds.includes(task.id));
  expect(block.start).toBe('10:00');
  expect(block.end).toBe(name==='Siguiente'?'11:00':'');
 }
});

test('play de Jornada comparte celda con eliminar y retoma sin duplicar horas',async({page,request})=>{
 await setup(page,request);
 await page.getByRole('button',{name:'Jornada',exact:true}).click();await page.clock.runFor(500);
 const row=page.locator('tr').filter({has:page.locator('input[value="Investigar sin duración"]')});
 const play=row.locator('[data-start-task]');
 await expect(play).toBeVisible();
 await expect(play.locator('xpath=ancestor::td').locator('[data-delete-task]')).toHaveCount(1);
 await expect(play).toHaveCSS('color','rgb(50, 168, 82)');
 await play.click();await read(page,request);
 await expect(row.locator('[data-start-task]')).toBeHidden();
 await page.getByRole('button',{name:'Foco',exact:true}).click();await page.clock.runFor(500);
 await page.clock.fastForward(90*60000);
 await (await menu(page)).getByRole('button',{name:'Terminar tarea',exact:true}).click();await read(page,request);
 await page.clock.fastForward(210*60000);
 await page.getByRole('button',{name:'Jornada',exact:true}).click();await page.clock.runFor(500);
 await expect(play).toBeVisible();await play.click();
 let data=await read(page,request);
 const task=data.days['2026-10-16'].plan.tasks.find(t=>t.name==='Investigar sin duración');
 expect(data.days['2026-10-16'].plan.blocks.find(b=>b.taskIds.includes(task.id))).toMatchObject({start:'13:30',end:'',openStarted:true});
 await page.getByRole('button',{name:'Foco',exact:true}).click();await page.clock.runFor(500);
 await page.clock.fastForward(30*60000);
 await (await menu(page)).getByRole('button',{name:'Terminar tarea',exact:true}).click();
 data=await read(page,request);
 expect(data.days['2026-10-16'].actual.blocks).toHaveLength(1);
 expect(data.days['2026-10-16'].actual.blocks[0]).toMatchObject({start:'13:30',end:'15:30'});
});

test('play de Jornada adelanta una pendiente conservando duración',async({page,request})=>{
 await setup(page,request);
 await page.getByRole('button',{name:'Jornada',exact:true}).click();await page.clock.runFor(500);
 const row=page.locator('tr').filter({has:page.locator('input[value="Siguiente"]')});
 await row.locator('[data-start-task]').click();
 const data=await read(page,request),plan=data.days['2026-10-16'].plan;
 const task=plan.tasks.find(t=>t.name==='Siguiente');
 expect(plan.blocks.find(b=>b.taskIds.includes(task.id))).toMatchObject({start:'10:00',end:'11:00'});
 await expect(row.locator('[data-start-task]')).toBeHidden();
 await page.screenshot({path:'test-results/grid-play.png',animations:'disabled'});
});

test('estado muestra spinner discreto al iniciar y conserva edición al avanzar el reloj',async({page,request})=>{
 await setup(page,request,'2026-10-16T11:59:00');
 await page.getByRole('button',{name:'Jornada',exact:true}).click();await page.clock.runFor(500);
 const row=page.locator('tr').filter({has:page.locator('input[value="Siguiente"]')});
 await expect(row.locator('[data-status="pending"]')).toBeVisible();
 const input=row.locator('input[data-col="3"]');await input.focus();
 await page.clock.fastForward(60000);
 const spinner=row.locator('[data-status="running"]');
 await expect(spinner).toBeVisible();await expect(input).toBeFocused();
 expect(await spinner.evaluate(el=>getComputedStyle(el).color)).toBe(await row.locator('.delete-task').evaluate(el=>getComputedStyle(el).color));
 await expect(spinner.locator('svg')).toHaveCSS('animation-name','task-status-spin');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(spinner.locator('svg')).toHaveCSS('animation-name','none');
 await row.locator('[data-task-status]').click();
 await page.getByRole('option',{name:'Completada',exact:true}).click();
 await expect(row.locator('[data-status="finished"]')).toBeVisible();
 await expect(row.locator('[data-status="running"]')).toHaveCount(0);
});

for (const name of ['Investigar sin duración','Siguiente']) test(`stop en Jornada termina ${name} y registra tiempo efectivo`,async({page,request})=>{
 await setup(page,request);
 await page.getByRole('button',{name:'Jornada',exact:true}).click();await page.clock.runFor(500);
 const row=page.locator('tr').filter({has:page.locator(`input[value="${name}"]`)});
 await expect(row.locator('[data-stop-task]')).toBeHidden();
 await row.locator('[data-start-task]').click();await read(page,request);
 const stop=row.locator('[data-stop-task]');
 await expect(stop).toBeVisible();
 await expect(row.locator('[data-start-task]')).toBeHidden();
 await expect(stop).toHaveCSS('color','rgb(224, 74, 71)');
 await expect(stop.locator('xpath=ancestor::td').locator('[data-delete-task]')).toHaveCount(1);
 await page.clock.fastForward(20*60000);
 await stop.click();
 const data=await read(page,request);
 expect(data.days['2026-10-16'].actual.blocks).toHaveLength(1);
 expect(data.days['2026-10-16'].actual.blocks[0]).toMatchObject({start:'10:00',end:'10:20'});
 await expect(row.locator('[data-status="finished"]')).toBeVisible();
 await expect(stop).toBeHidden();
 await expect(row.locator('[data-start-task]')).toBeVisible();
 await page.reload();
 await expect(row.locator('[data-status="finished"]')).toBeVisible();
});
