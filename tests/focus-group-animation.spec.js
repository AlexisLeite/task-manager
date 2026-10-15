import { test, expect } from '@playwright/test';
import { document as newDocument, task, block } from '../src/model.js';

test('agrupar tareas por horario anima el espacio entre filas', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T10:00:00') });
  const plan = newDocument();
  for (const [name, end, estimate] of [['Primera', '11:00', '02:00'], ['Segunda', '12:00', '03:00']]) {
    const definition = { ...task(plan.tasks), name, estimate };
    plan.tasks.push(definition);
    plan.blocks.push({ ...block(), taskIds: [definition.id], start: '09:00', end });
  }
  await page.addInitScript(data => localStorage.setItem('jornada.v1', JSON.stringify(data)), {
    version: 2, tasks: [], days: { '2026-10-15': { plan, actual: null } },
  });
  await page.goto('/#/foco');
  const rows = page.locator('[data-focus-id]');
  await rows.first().getByRole('heading').click({ button: 'right' });
  await page.getByRole('button', { name: 'Extender tarea', exact: true }).click();
  await page.getByLabel('Hora de finalización').fill('12');
  await page.getByRole('button', { name: 'Extender', exact: true }).click();
  await expect(page.locator('.focus-shared')).toHaveCount(2);
  const animations = await rows.evaluateAll(nodes => nodes.flatMap(node => node.getAnimations().map(animation => animation.transitionProperty)));
  expect(animations.some(property => property === 'padding-top' || property === 'padding-bottom')).toBe(true);
  await expect(page.getByRole('progressbar')).toHaveCount(1);
  await expect(page.locator('.focus-shared-first')).toHaveCSS('padding-bottom', '5px');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(rows.first()).toHaveCSS('transition-duration', '0s');
});
