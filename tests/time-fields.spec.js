import { test, expect } from '@playwright/test';

test('horas y duración normalizan horas sueltas al salir en grillas y modal', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T15:00:00') });
  await page.goto('/#/jornada');
  await page.getByLabel('Fecha de jornada').fill('2026-10-15');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  for (const [label, value, expected] of [
    ['Tarea 1: Duración', '2', '02:00'],
    ['Plan 1: Hora inicio', '14', '14:00'],
    ['Plan 1: Hora fin', '19', '19:00'],
  ]) {
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.blur();
    await expect(field).toHaveValue(expected);
  }
  await page.getByRole('button', { name: 'Foco', exact: true }).click();
  const row = page.locator('[data-focus-id]').first();
  await row.locator('.focus-remaining summary').click();
  await page.getByRole('button', { name: 'Posponer tarea', exact: true }).click();
  const hour = page.getByLabel('Hora', { exact: true });
  await hour.fill('19');
  await hour.blur();
  await expect(hour).toHaveValue('19:00');
  await hour.fill('25');
  await hour.blur();
  await page.getByRole('button', { name: 'Posponer', exact: true }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
});
