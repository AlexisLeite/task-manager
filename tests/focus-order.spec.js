import { test, expect } from '@playwright/test';
import { document as newDocument, task, block } from '../src/model.js';

test('Foco ordena por fin y se reordena al cambiarlo', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T10:00:00') });
  const plan = newDocument();
  for (const [name, end] of [['Larga', '13:00'], ['Corta', '11:00'], ['Media', '12:00']]) {
    const definition = { ...task(plan.tasks), name, estimate: `${String(Number(end.slice(0,2))-9).padStart(2,'0')}:00` };
    plan.tasks.push(definition);
    plan.blocks.push({ ...block(), taskIds:[definition.id], start:'09:00', end });
  }
  plan.focusOrder = plan.tasks.map(task => task.id);
  await page.addInitScript(plan => { if (!localStorage.getItem('jornada.v1')) localStorage.setItem('jornada.v1', JSON.stringify({version:2,tasks:[],days:{'2026-10-15':{plan,actual:null}}})); }, plan);
  await page.goto('/#/foco');
  const headings = page.locator('[data-focus-id] h2');
  await expect(headings).toHaveText(['Corta','Media','Larga']);
  await headings.first().click({button:'right'});
  await page.getByRole('button',{name:'Extender tarea',exact:true}).click();
  await page.getByLabel('Hora de finalización').fill('14');
  await page.getByRole('button',{name:'Extender',exact:true}).click();
  await expect(headings).toHaveText(['Media','Larga','Corta']);
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.reload();
  await expect(headings).toHaveText(['Media','Larga','Corta']);
});
