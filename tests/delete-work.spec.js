import { test, expect } from '@playwright/test';
import { document as empty, task, block, normalizeDocument } from '../src/model.js';

test('eliminar corrige 10:25 trabajadas, conserva otras tareas y persiste tras recargar', async ({ page }) => {
  const deleted = {...task([]), name:'Registro equivocado', estimate:'10:25'};
  const kept = {...task([deleted]), name:'Trabajo real', estimate:'01:00'};
  const plan = {...empty(), tasks:[deleted, kept], blocks:[
    {...block(), taskIds:[deleted.id], start:'09:00', end:'19:25', focusStates:{[deleted.id]:'finished'}},
    {...block(), taskIds:[kept.id], start:'09:00', end:'10:00', focusStates:{[kept.id]:'finished'}},
  ]};
  const actual = {...empty(), tasks:structuredClone(plan.tasks), blocks:plan.blocks.map(row => ({...row, sourceFocus:`${row.id}/${row.taskIds[0]}`}))};
  normalizeDocument(plan);
  normalizeDocument(actual);
  const data = {version:2, tasks:[], days:{
    '2026-11-11':{plan:empty(), actual:structuredClone(actual)},
    '2026-11-12':{plan, actual},
  }};
  await page.clock.install({ time:new Date('2026-11-12T20:00:00') });
  await page.addInitScript(data => {
    if (!localStorage.getItem('jornada.v1')) localStorage.setItem('jornada.v1', JSON.stringify(data));
  }, data);
  await page.goto('/#/jornada');
  await expect(page.locator('#total')).toHaveText('Trabajado: 10:25 hs');
  const remove = async () => {
    await page.getByRole('button', {name:'Eliminar t1',exact:true}).click();
    await expect(page.locator('dialog[open]')).toContainText('sus horas registradas en esta jornada');
    await page.locator('dialog[open]').getByRole('button', {name:'Eliminar',exact:true}).click();
    await expect(page.locator('#saved')).toHaveText('Guardado');
  };
  await remove();
  await expect(page.locator('#total')).toHaveText('Trabajado: 1:00 hs');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#total')).toHaveText('Trabajado: 10:25 hs');
  await remove();
  await page.reload();
  await expect(page.locator('#total')).toHaveText('Trabajado: 1:00 hs');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jornada.v1')));
  expect(saved.days['2026-11-11']).toEqual(data.days['2026-11-11']);
  expect(saved.days['2026-11-12'].actual.tasks.map(task => task.id)).toEqual([kept.id]);
  await page.getByRole('button', {name:'Historia',exact:true}).click();
  await page.getByRole('button', {name:'Filtros',exact:true}).click();
  await page.getByLabel('Desde', {exact:true}).fill('2026-11-12');
  await page.getByLabel('Hasta', {exact:true}).fill('2026-11-12');
  await expect(page.locator('#history-actual')).toHaveText('1:00 hs');
  await expect(page.locator('main')).toContainText('Trabajo real');
  await expect(page.locator('main')).not.toContainText('Registro equivocado');
});
