import { test, expect } from '@playwright/test';
import { document as newDocument, task, block } from '../src/model.js';

test('clic derecho sitúa el menú en el cursor y los tres puntos conservan su posición', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T09:30:00') });
  const plan = newDocument();
  const definition = { ...task([]), name: 'Contexto', estimate: '02:00' };
  plan.tasks.push(definition);
  plan.blocks.push({ ...block(), taskIds: [definition.id], start: '09:00', end: '11:00' });
  await page.addInitScript(data => localStorage.setItem('jornada.v1', JSON.stringify(data)), {
    version: 2, tasks: [], days: { '2026-10-15': { plan, actual: null } },
  });
  await page.goto('/#/foco');
  const row = page.locator('[data-focus-id]');
  const menu = row.locator('.focus-remaining .focus-menu');
  const panel = menu.locator(':scope > div');
  const title = await row.getByRole('heading').boundingBox();
  const point = { x: title.x + 20, y: title.y + 15 };
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(panel).toBeVisible();
  let bounds = await panel.boundingBox();
  expect(Math.abs(bounds.x - point.x)).toBeLessThan(2);
  expect(Math.abs(bounds.y - point.y)).toBeLessThan(2);
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await menu.locator('summary').click();
  const trigger = await menu.locator('summary').boundingBox();
  bounds = await panel.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(trigger.y + trigger.height);
  await page.mouse.click(5, 5);
  await expect(menu).not.toHaveAttribute('open', '');
  await page.setViewportSize({ width: 390, height: 400 });
  const card = await row.boundingBox();
  await page.mouse.click(card.x + card.width - 12, card.y + card.height - 12, { button: 'right' });
  await expect(panel).toBeVisible();
  bounds = await panel.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(383);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(393);
});
