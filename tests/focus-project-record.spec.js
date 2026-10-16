import { test, expect } from '@playwright/test';
import { document as newDocument, task, block } from '../src/model.js';

test('completar desde Foco actualiza el proyecto de una definición realizada antigua', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-15T10:00:00')});
  const plan = newDocument();
  const definition = {...task([]),name:'Trabajo confirmado',projectId:'current',estimate:'02:00'};
  plan.tasks.push(definition);
  plan.blocks.push({...block(),taskIds:[definition.id],start:'09:00',end:'11:00'});
  const actual = structuredClone(plan);
  actual.tasks[0].projectId = '';
  await page.addInitScript(data=>localStorage.setItem('jornada.v1',JSON.stringify(data)),{version:2,tasks:[],projects:[{id:'current',name:'Proyecto actual'}],days:{'2026-10-15':{plan,actual}}});
  await page.goto('/#/foco');
  await page.locator('[data-focus-id] .focus-remaining summary').click();
  await page.getByRole('button',{name:'Terminar tarea',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Guardado');
  const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('jornada.v1')).days['2026-10-15'].actual);
  expect(saved.tasks[0].projectId).toBe('current');
  expect(saved.blocks).toHaveLength(1);
  expect(saved.blocks[0].sourceFocus).toBeTruthy();
  await page.getByRole('button',{name:'Historia',exact:true}).click();
  await expect(page.locator('[data-history-project-bar="current"]')).toHaveAttribute('data-minutes','60');
});


test('changing a completed task project updates History and preserves recorded hours',async({page})=>{
 const plan=newDocument();
 const definition={...task([]),name:'Recorded task',projectId:'old',estimate:'01:00'};
 const schedule={...block(),taskIds:[definition.id],start:'09:00',end:'10:00',focusStates:{[definition.id]:'finished'}};
 plan.tasks.push(definition);plan.blocks.push(schedule);
 const actual=structuredClone(plan);actual.blocks[0].sourceFocus=`${schedule.id}/${definition.id}`;
 const older=structuredClone(actual);older.blocks[0].sourceFocus=`other/${definition.id}`;
 const data={version:2,tasks:[],projects:[{id:'old',name:'Old project'},{id:'new',name:'New project'}],days:{'2026-10-16':{plan,actual},'2026-10-15':{plan:newDocument(),actual:older}}};
 await page.addInitScript(data=>{localStorage.setItem('jornada.v1',JSON.stringify(data));localStorage.setItem('jornada.selectedDate','2026-10-16');},data);
 await page.goto('/#/jornada');
 await page.locator('select[data-col="4"]').selectOption('new');
 await expect(page.locator('#saved')).toHaveText('Guardado');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('jornada.v1')));
 expect(saved.days['2026-10-16'].actual.tasks[0].projectId).toBe('new');
 expect(saved.days['2026-10-16'].actual.blocks[0]).toMatchObject({start:'09:00',end:'10:00'});
 expect(saved.days['2026-10-15'].actual.tasks[0].projectId).toBe('old');
 await page.getByRole('button',{name:'Historia',exact:true}).click();
 await expect(page.locator('.report tbody tr').filter({hasText:'New project'})).toContainText('1:00 hs');
 await expect(page.locator('.report tbody tr').filter({hasText:'Old project'})).toContainText('1:00 hs');
});
