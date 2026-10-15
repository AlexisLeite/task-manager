import { test, expect } from '@playwright/test';

test('hover del plan resalta sus tareas en ambas grillas y se limpia al salir', async ({ page }) => {
  await page.goto('/#/jornada');
  await page.getByLabel('Fecha de jornada').fill('2026-10-15');
  await page.getByRole('button', {name:'Cargar ejemplo',exact:true}).click();
  const blocks = page.locator('[data-table="blocks"] tbody tr');
  const tasks = page.locator('[data-table="tasks"] tbody tr');
  await blocks.first().hover();
  await expect(blocks.first()).toHaveClass(/linked-task-hover/);
  await expect(tasks.first()).toHaveClass(/linked-task-hover/);
  await expect(page.locator('[data-table="tasks"] .linked-task-hover')).toHaveCount(1);
  await expect(tasks.first().locator('td').first()).toHaveCSS('background-color', 'rgb(238, 240, 235)');
  await blocks.nth(1).hover();
  await expect(tasks.first()).not.toHaveClass(/linked-task-hover/);
  await expect(tasks.nth(1)).toHaveClass(/linked-task-hover/);
  await page.getByRole('button',{name:'Jornada',exact:true}).hover();
  await expect(page.locator('.linked-task-hover')).toHaveCount(0);
  await tasks.nth(1).hover();
  await expect(tasks.nth(1)).toHaveClass(/linked-task-hover/);
  await expect(blocks.nth(1)).toHaveClass(/linked-task-hover/);
  await expect(blocks.first()).not.toHaveClass(/linked-task-hover/);
  await page.getByRole('button',{name:'Jornada',exact:true}).hover();
  await expect(page.locator('.linked-task-hover')).toHaveCount(0);
});
