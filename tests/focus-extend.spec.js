import { test, expect } from '@playwright/test';
import { document as newDocument, task, block } from '../src/model.js';

test('extender desde menú y desde vencida conserva la tarea y valida el nuevo fin', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T10:00:00') });
  await page.clock.pauseAt(new Date('2026-10-15T10:00:00'));
  const plan = newDocument();
  const definition = { ...task([]), name: 'Extensión', estimate: '02:00' };
  plan.tasks.push(definition);
  plan.blocks.push({ ...block(), taskIds: [definition.id], start: '09:00', end: '11:00' });
  await page.addInitScript(data => {
    if (!localStorage.getItem('jornada.v1')) localStorage.setItem('jornada.v1', JSON.stringify(data));
  }, { version: 2, tasks: [], days: { '2026-10-15': { plan, actual: null } } });
  await page.goto('/#/foco');
  const row = page.locator('[data-focus-id]');
  await row.getByRole('heading').click({ button: 'right' });
  await page.getByRole('button', { name: 'Extender tarea', exact: true }).click();
  await page.locator('dialog[open]').getByLabel('Hora de finalización').fill('10:00');
  await page.locator('dialog[open]').getByRole('button', { name: 'Extender', exact: true }).click();
  await expect(page.locator('dialog [role=alert]')).toContainText('posterior');
  await page.locator('dialog[open]').getByLabel('Hora de finalización').fill('10:30');
  await page.locator('dialog[open]').getByRole('button', { name: 'Extender', exact: true }).click();
  await expect(row.locator('time')).toHaveText('00:30:00');
  await row.getByRole('heading').click({ button: 'right' });
  await page.getByRole('button', { name: 'Extender tarea', exact: true }).click();
  await page.locator('dialog[open]').getByLabel('Hora de finalización').fill('12');
  await page.locator('dialog[open]').getByLabel('Hora de finalización').blur();
  await expect(page.locator('dialog[open]').getByLabel('Hora de finalización')).toHaveValue('12:00');
  await page.locator('dialog[open]').getByRole('button', { name: 'Extender', exact: true }).click();
  await expect(row.locator('time')).toHaveText('02:00:00');
  await page.clock.fastForward(2 * 3600000);
  await row.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reprogramar tarea', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Extender tarea', exact: true }).click();
  await page.locator('dialog[open]').getByLabel('Hora de finalización').fill('13:00');
  await page.locator('dialog[open]').getByRole('button', { name: 'Extender', exact: true }).click();
  await expect(row.locator('time')).toHaveText('01:00:00');
  await expect(row.getByRole('button', { name: 'Completa', exact: true })).toHaveCount(0);
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.reload();
  await expect(row.locator('time')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jornada.v1')).days['2026-10-15']);
  expect(saved.plan.blocks).toHaveLength(1);
  expect(saved.plan.blocks[0].end).toBe('13:00');
  expect(saved.plan.tasks[0].estimate).toBe('04:00');
  expect(saved.actual).toBeNull();
});


