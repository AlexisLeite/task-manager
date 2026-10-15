import { test, expect } from '@playwright/test';

test('editar duración actualiza el fin y persiste al recargar', async ({ page }) => {
  await page.goto('/#/jornada');
  await page.getByLabel('Fecha de jornada').fill('2026-10-15');
  await page.getByRole('button',{name:'Cargar ejemplo',exact:true}).click();
  const duration = page.getByLabel('Tarea 1: Duración',{exact:true});
  await duration.fill('03:00');
  await expect(page.getByLabel('Plan 1: Hora fin',{exact:true})).toHaveValue('17:30');
  await duration.fill('1');
  await duration.blur();
  await expect(duration).toHaveValue('01:00');
  await expect(page.getByLabel('Plan 1: Hora fin',{exact:true})).toHaveValue('15:30');
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.reload();
  await expect(page.getByLabel('Plan 1: Hora fin',{exact:true})).toHaveValue('15:30');
});
