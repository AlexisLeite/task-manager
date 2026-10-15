import { test, expect } from '@playwright/test';

test('prioridad comparte celda con el código y queda centrada en ambas grillas', async ({ page }) => {
  await page.goto('/#/jornada');
  await page.getByLabel('Fecha de jornada').fill('2026-10-15');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  const tasks = page.locator('[data-table="tasks"]');
  await expect(tasks.locator('th')).toHaveText(['', 'Tarea', 'Duración', 'Descripción', 'Proyecto']);
  for (const grid of ['tasks', 'blocks']) {
    const row = page.locator(`[data-table="${grid}"] tbody tr`).first();
    const code = row.locator('input[data-col="0"]');
    const dot = code.locator('..').locator('.priority-dot').first();
    await expect(dot).toBeVisible();
    const inputBounds = await code.boundingBox();
    const dotBounds = await dot.boundingBox();
    expect(Math.abs(inputBounds.y + inputBounds.height / 2 - dotBounds.y - dotBounds.height / 2)).toBeLessThan(2);
  }
  const control = page.getByLabel('Tarea 1: Prioridad', { exact: true });
  await control.click();
  await control.locator('..').getByRole('button', { name: 'Alta', exact: true }).click();
  await expect(control).toHaveAttribute('data-priority-value', 'Alta');
  await expect(page.locator('[data-table="blocks"] tbody tr').first().locator('summary .priority-dot')).toHaveClass('priority-dot alta');
});
