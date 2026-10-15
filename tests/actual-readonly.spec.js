import { test, expect } from '@playwright/test';

test('Realizado solo se genera desde Foco y no admite edición ni pegado', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T15:00:00') });
  await page.goto('/#/jornada');
  await page.getByLabel('Fecha de jornada').fill('2026-10-15');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await page.getByRole('button', { name: 'Realizado', exact: true }).click();
  await expect(page.getByText('Todavía no hay trabajo registrado desde Foco.')).toBeVisible();
  await expect(page.locator('#reconcile')).toHaveCount(0);
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('main input, main select, main textarea')).toHaveCount(0);
  await page.getByRole('button', { name: 'Foco', exact: true }).click();
  await page.locator('[data-focus-id]:not(:has(.focus-expired-actions))').first().locator('.focus-remaining summary').click();
  await page.getByRole('button', { name: 'Terminar tarea', exact: true }).click();
  await expect(page.locator('#saved')).toHaveText('Guardado');
  const readActual = () => page.evaluate(() => JSON.parse(localStorage.getItem('jornada.v1')).days['2026-10-15'].actual);
  const before = await readActual();
  expect(before.blocks).toHaveLength(1);
  await page.getByRole('button', { name: 'Jornada', exact: true }).click();
  await page.getByRole('button', { name: 'Realizado', exact: true }).click();
  const report = page.getByRole('table', { name: 'Trabajo realizado' });
  await expect(report).toBeVisible();
  await expect(report.locator('input, select, button, textarea, [contenteditable]')).toHaveCount(0);
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+z');
  await report.dispatchEvent('paste', { clipboardData: await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData('text/plain', 't9\t01:00\tMedia\tManual'); return data; }) });
  expect(await readActual()).toEqual(before);
});
