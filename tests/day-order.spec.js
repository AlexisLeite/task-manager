import { test, expect } from '@playwright/test';

test('ambas grillas ordenan al salir del plan sin interrumpir la edición', async ({ page }) => {
  await page.goto('/#/jornada');
  await page.getByLabel('Fecha de jornada').fill('2026-10-15');
  await page.getByRole('button',{name:'Cargar ejemplo',exact:true}).click();
  const taskCodes = page.locator('[data-grid="tasks"][data-col="0"]');
  const planCodes = page.locator('[data-grid="blocks"][data-col="0"]');
  await page.getByLabel('Plan 1: Hora inicio',{exact:true}).fill('22:00');
  await page.getByLabel('Plan 2: Hora inicio',{exact:true}).focus();
  await expect(planCodes.first()).toHaveValue('t1');
  await page.getByLabel('Tarea 1: Descripción',{exact:true}).focus();
  await expect(planCodes.first()).toHaveValue('t2,t3');
  await expect(taskCodes.first()).toHaveValue('t2');
  await expect(taskCodes.last()).toHaveValue('t1');
  await expect(page.locator('[data-grid="tasks"][data-col="3"]').last()).toBeFocused();
  await expect(page.locator('#add-tasks')).toHaveCount(1);
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.reload();
  await expect(taskCodes.first()).toHaveValue('t2');
});
