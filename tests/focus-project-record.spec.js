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
