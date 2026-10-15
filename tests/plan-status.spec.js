import { test, expect } from '@playwright/test';
import { document as newDocument, task, block } from '../src/model.js';

test('Estado refleja terminar y cancelar desde Foco y conserva pendientes', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T10:00:00') });
  const plan = newDocument();
  for (const name of ['Completar', 'Cancelar', 'Pendiente']) {
    const definition = { ...task(plan.tasks), name, estimate: '02:00' };
    plan.tasks.push(definition);
    plan.blocks.push({ ...block(), taskIds: [definition.id], start: '09:00', end: '11:00' });
  }
  await page.addInitScript(data => {
    if (!localStorage.getItem('jornada.v1')) localStorage.setItem('jornada.v1', JSON.stringify(data));
  }, { version: 2, tasks: [], days: { '2026-10-15': { plan, actual: null } } });
  await page.goto('/#/foco');
  for (const [name, action] of [['Completar', 'Terminar tarea'], ['Cancelar', 'Cancelar tarea']]) {
    const row = page.locator('[data-focus-id]').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await row.locator('.focus-remaining summary').click();
    await row.getByRole('button', { name: action, exact: true }).click();
  }
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.getByRole('button', { name: 'Jornada', exact: true }).click();
  await page.getByLabel('Fecha de jornada').fill('2026-10-15');
  const table = page.getByRole('table', { name: 'Plan de trabajo' });
  await expect(table.locator('th')).toHaveText(['', 'Tarea', 'Descripción', 'Hora inicio', 'Hora fin', 'Estado']);
  for (const [code, state] of [['t1', 'Terminada'], ['t2', 'Cancelada'], ['t3', 'Pendiente']]) {
    await expect(table.getByRole('img', { name: `${code}: ${state}`, exact: true })).toBeVisible();
  }
  for (const [state, color] of [['finished', 'rgb(50, 168, 82)'], ['cancelled', 'rgb(224, 74, 71)'], ['pending', 'rgb(225, 181, 33)']]) {
    await expect(table.locator(`td:last-child [data-status="${state}"]`)).toHaveCSS('color', color);
  }
  await page.reload();
  await expect(table.getByRole('img', { name: 't1: Terminada', exact: true })).toBeVisible();
});
