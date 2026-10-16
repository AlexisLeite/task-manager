import {test,expect} from '@playwright/test';
import {document as empty,task,block,normalizeDocument} from '../src/model.js';
function fixture(rows,day='2026-10-16') {
 const plan=empty();for(const [name,start,end,estimate,state,endDay=0] of rows) {
  const t={...task(plan.tasks),name,estimate};plan.tasks.push(t);plan.blocks.push({...block(),taskIds:[t.id],start,end,endDay,focusStates:state?{[t.id]:state}:{}});
 }normalizeDocument(plan);return {version:2,projects:[],tasks:[],days:{[day]:{plan,actual:null}}};
}
const standard=()=>fixture([['Pasada','08:00','09:00','01:00'],['Activa','09:00','11:00','02:00'],['Paralela','09:00','11:00','02:00'],['Futura','12:00','13:00','01:00'],['Terminada','09:00','11:00','02:00','finished'],['Cancelada','12:00','13:00','01:00','cancelled']]);
async function setup(page,request,data=standard(),now='2026-10-16T10:00:00') {
 const current=await request.get('/api/workspace');
 expect((await request.put('/api/workspace',{headers:{'If-Match':current.headers().etag},data})).ok()).toBeTruthy();
 await page.clock.install({time:new Date(now)});await page.clock.pauseAt(new Date(now));
 await page.goto('/#/jornada');
 await expect(page.getByRole('button',{name:'Pausar el tiempo',exact:true})).toBeVisible();
}
async function read(page,request) {await expect(page.locator('#saved')).toHaveText('Guardado');return (await request.get('/api/workspace')).json();}
function row(data,name) {for(const [date,day]of Object.entries(data.days)){const t=day.plan.tasks.find(t=>t.name===name);if(t){const b=day.plan.blocks.find(b=>b.taskIds.includes(t.id));return {date,...b};}}}
async function open(page) {await page.locator('#app-clock').click();await page.clock.runFor(500);return page.locator('dialog[open]');}

test('SQLite: pausa y reload desplazan toda la agenda elegible una sola vez',async({page,request})=>{
 const original=standard();await setup(page,request,original);
 await page.getByLabel('Pausar el tiempo',{exact:true}).click();await read(page,request);
 await page.clock.fastForward(45*60000);await page.reload();
 await expect(page.locator('#app-clock')).toHaveText('10:00:00');
 await page.getByLabel('Reanudar el tiempo',{exact:true}).click();
 const data=await read(page,request);
 for(const name of ['Activa','Paralela'])expect(row(data,name)).toMatchObject({start:'09:45',end:'11:45'});
 expect(row(data,'Futura')).toMatchObject({start:'12:45',end:'13:45'});
 for(const name of ['Pasada','Terminada','Cancelada'])expect(row(data,name)).toEqual(row(original,name));
 await page.reload();expect(row(await read(page,request),'Activa').start).toBe('09:45');
 expect(data.days['2026-10-16'].actual).toBeNull();
});

test('SQLite: medianoche mueve bloques completos y conserva agenda propia del día siguiente',async({page,request})=>{
 const data=fixture([['Noche','22:00','00:00','02:00',null,1],['Después','23:30','00:30','01:00',null,1]]);
 data.days['2026-10-17']=fixture([['Mañana','10:00','11:00','01:00']],'2026-10-17').days['2026-10-17'];
 await setup(page,request,data,'2026-10-16T23:00:00');
 await page.getByLabel('Pausar el tiempo',{exact:true}).click();await read(page,request);
 await page.clock.fastForward(2*3600000);
 await page.getByLabel('Reanudar el tiempo',{exact:true}).click();
 const saved=await read(page,request);
 expect(row(saved,'Noche')).toMatchObject({date:'2026-10-17',start:'00:00',end:'02:00'});
 expect(row(saved,'Después')).toMatchObject({date:'2026-10-17',start:'01:30',end:'02:30'});
 expect(row(saved,'Mañana')).toEqual(row(data,'Mañana'));
 await page.getByLabel('Fecha de jornada').fill('2026-10-17');
 await expect(page.locator('tbody tr')).toHaveCount(3);
 await page.reload();await expect(page.locator('tbody tr')).toHaveCount(3);
 expect(new Set(saved.days['2026-10-17'].plan.tasks.map(t=>t.code)).size).toBe(3);
});

for(const theme of ['light','dark']) test(`popup ${theme}: teclado, scroll, previsualización y cancelación no escriben SQLite`,async({page,request},testInfo)=>{
 await page.addInitScript(theme=>localStorage.setItem('jornada.theme',theme),theme);
 await setup(page,request);
 const before=await read(page,request);const dialog=await open(page);
 await expect(page).toHaveURL(/#\/foco$/);
 await dialog.getByLabel('Hora',{exact:true}).fill('8');
 await expect(page.locator('#app-clock')).toHaveText('08:00:00');
 await dialog.getByLabel('Hora',{exact:true}).press('ArrowUp');
 await expect(dialog.getByLabel('Hora',{exact:true})).toHaveValue('08:15');
 await dialog.getByLabel('Hora',{exact:true}).dispatchEvent('wheel',{deltaY:100});
 await expect(dialog.getByLabel('Hora',{exact:true})).toHaveValue('08:00');
 await expect(page.locator('[data-focus-id] h2')).toHaveText(['Pasada']);
 await page.clock.runFor(1000);
 const popup=await dialog.boundingBox(),focus=await page.locator('#focus-content').boundingBox();
 expect(focus.x+focus.width).toBeLessThanOrEqual(popup.x);
 await expect(page.locator('[data-focus-id] h2').first()).toBeVisible();
 await page.screenshot({path:testInfo.outputPath(`popup-${theme}.png`),fullPage:true,animations:'disabled'});
 expect(await read(page,request)).toEqual(before);
 await page.mouse.click(3,3);await expect(page.locator('dialog[open]')).toHaveCount(0);
 await expect(page.locator('#app-clock')).toHaveText('10:00:01');
 expect(await read(page,request)).toEqual(before);
});

test('retroceso durante pausa: hora inválida, Escape conserva pausa, confirmar aplica una sola vez',async({page,request})=>{
 await setup(page,request);await page.getByLabel('Pausar el tiempo',{exact:true}).click();await read(page,request);
 await page.clock.fastForward(30*60000);
 let dialog=await open(page);
 await dialog.getByLabel('Hora',{exact:true}).fill('25');
 await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('válidas');
 await page.keyboard.press('Escape');await expect(page.locator('#app-clock')).toHaveText('10:00:00');
 dialog=await open(page);await dialog.getByLabel('Hora',{exact:true}).fill('09:30');
 await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();
 const data=await read(page,request);
 expect(row(data,'Activa')).toMatchObject({start:'10:00',end:'12:00'});
 expect(row(data,'Futura')).toMatchObject({start:'13:00',end:'14:00'});
 expect(data.timeControl.pausedAt).toBeNull();
});

test('pausa en Foco congela contador y no incorpora tareas que todavía no iniciaron',async({page,request})=>{
 await setup(page,request);await page.getByRole('button',{name:'Foco',exact:true}).click();await page.clock.runFor(500);
 await page.getByLabel('Pausar el tiempo',{exact:true}).click();await read(page,request);
 const times=await page.locator('[data-focus-id] time').allTextContents();
 await page.clock.fastForward(3*3600000);
 await expect(page.locator('[data-focus-id] time')).toHaveText(times);
 await expect(page.locator('[data-focus-id] h2')).not.toContainText(['Futura']);
 await page.getByLabel('Reanudar el tiempo',{exact:true}).click();
 const data=await read(page,request);expect(row(data,'Futura')).toMatchObject({start:'15:00',end:'16:00'});
});

test('pausas de segundos no saltan un minuto al cambiar el reloj y se acumulan',async({page,request})=>{
 await setup(page,request,standard(),'2026-10-16T10:00:59');
 await page.getByLabel('Pausar el tiempo',{exact:true}).click();await read(page,request);
 await page.clock.fastForward(1000);await page.getByLabel('Reanudar el tiempo',{exact:true}).click();
 expect(row(await read(page,request),'Activa').start).toBe('09:00');
 for(let i=0;i<3;i++) {
  await page.getByLabel('Pausar el tiempo',{exact:true}).click();await read(page,request);
  await page.clock.fastForward(20000);await page.getByLabel('Reanudar el tiempo',{exact:true}).click();await read(page,request);
 }
 const saved=await read(page,request);
 expect(row(saved,'Activa')).toMatchObject({start:'09:01',end:'11:01'});
 expect(row(saved,'Futura')).toMatchObject({start:'12:01',end:'13:01'});
});

test('popup móvil deja las actividades visibles y cierra sin aplicar al cancelar',async({page,request},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await setup(page,request);
 const dialog=await open(page);await dialog.getByLabel('Hora',{exact:true}).fill('09:30');
 await page.clock.runFor(1000);
 await page.screenshot({path:testInfo.outputPath('popup-mobile.png'),fullPage:true,animations:'disabled'});
 const popup=await dialog.boundingBox(),focus=await page.locator('#focus-content').boundingBox();
 expect(focus.y).toBeGreaterThanOrEqual(popup.y+popup.height);
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 expect(row(await read(page,request),'Activa').start).toBe('09:00');
});

test('avanzar previsualiza futuro y desplaza activas y futuras hacia atrás',async({page,request})=>{
 await setup(page,request);
 const before=await read(page,request),dialog=await open(page);
 await expect(dialog).toHaveAccessibleName('Control del tiempo');
 await dialog.getByLabel('Hora',{exact:true}).dispatchEvent('wheel',{deltaY:-100});
 await expect(dialog.getByLabel('Hora',{exact:true})).toHaveValue('10:15');
 await dialog.getByLabel('Hora',{exact:true}).fill('10:30');
 await expect(page.locator('#app-clock')).toHaveText('10:30:00');
 expect(await read(page,request)).toEqual(before);
 await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();
 const saved=await read(page,request);
 expect(row(saved,'Activa')).toMatchObject({start:'08:30',end:'10:30'});
 expect(row(saved,'Paralela')).toMatchObject({start:'08:30',end:'10:30'});
 expect(row(saved,'Futura')).toMatchObject({start:'11:30',end:'12:30'});
 expect(row(saved,'Pasada')).toEqual(row(before,'Pasada'));
 expect(saved.days['2026-10-16'].actual).toBeNull();
 await page.reload();expect(row(await read(page,request),'Activa').start).toBe('08:30');
});

test('avanzar cruza hacia el día anterior sin duplicar tareas',async({page,request})=>{
 const fixtureData=fixture([['Madrugada','00:15','01:15','01:00'],['Luego','02:00','03:00','01:00']]);
 await setup(page,request,fixtureData,'2026-10-16T00:30:00');
 const dialog=await open(page);await dialog.getByLabel('Hora',{exact:true}).fill('02:30');
 await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();
 const saved=await read(page,request);
 expect(row(saved,'Madrugada')).toMatchObject({date:'2026-10-15',start:'22:15',end:'23:15'});
 expect(row(saved,'Luego')).toMatchObject({date:'2026-10-16',start:'00:00',end:'01:00'});
 expect(Object.values(saved.days).flatMap(day=>day.plan.tasks)).toHaveLength(2);
});

test('scroll usa cuartos de hora e incluye la hora actual entre ellos',async({page,request})=>{
 await setup(page,request,standard(),'2026-10-16T10:07:00');
 const before=await read(page,request),dialog=await open(page),hour=dialog.getByLabel('Hora',{exact:true});
 await expect(hour).toHaveValue('10:07');
 for(const expected of ['10:15','10:30']) {await hour.dispatchEvent('wheel',{deltaY:-100});await expect(hour).toHaveValue(expected);}
 for(const expected of ['10:15','10:07','10:00','09:45']) {await hour.dispatchEvent('wheel',{deltaY:100});await expect(hour).toHaveValue(expected);}
 for(const expected of ['10:00','10:07','10:15']) {await hour.press('ArrowUp');await expect(hour).toHaveValue(expected);}
 await hour.fill('23:58');await hour.press('ArrowUp');
 await expect(hour).toHaveValue('00:00');await expect(dialog.getByLabel('Día',{exact:true})).toHaveValue('2026-10-17');
 await hour.press('ArrowDown');await expect(hour).toHaveValue('23:45');
 await expect(dialog.getByLabel('Día',{exact:true})).toHaveValue('2026-10-16');
 await page.keyboard.press('Escape');expect(await read(page,request)).toEqual(before);
});

test('abrir y cerrar anima la posición de Foco con posiciones intermedias',async({page,request})=>{
 await setup(page,request);await page.getByRole('button',{name:'Foco',exact:true}).click();await page.clock.runFor(500);
 await page.screenshot({animations:'disabled'});
 const before=await page.locator('main').boundingBox();
 const dialog=await open(page);
 const positions=await page.locator('main').evaluate(main=>{
  const animations=main.getAnimations().filter(a=>a.transitionProperty==='margin-left');
  if (!animations.length) return null;
  for(const animation of animations){animation.pause();animation.currentTime=0;}
  const start=main.getBoundingClientRect().x;
  for(const animation of animations)animation.currentTime=100;
  const middle=main.getBoundingClientRect().x;
  for(const animation of animations)animation.finish();
  return {start,middle,end:main.getBoundingClientRect().x};
 });
 expect(positions).not.toBeNull();
 expect(positions.start).toBeCloseTo(before.x,0);
 expect(positions.middle).toBeLessThan(positions.start);
 expect(positions.middle).toBeGreaterThan(positions.end);
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 const returning=await page.locator('main').evaluate(main=>{
  const animation=main.getAnimations().find(a=>a.transitionProperty==='margin-left');
  if(!animation)return false;
  animation.finish();return true;
 });
 expect(returning).toBe(true);
});
