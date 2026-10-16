import {test,expect} from '@playwright/test';
test('Jornada recuerda el día elegido, flechas y Hoy al recargar',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00'));
  await page.goto('/#/jornada');
  const date=page.getByLabel('Fecha de jornada');
  await date.fill('2026-09-23');
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('jornada.selectedDate'))).toBe('2026-09-23');
  await page.reload();await expect(date).toHaveValue('2026-09-23');
  await page.getByRole('button',{name:'Día siguiente',exact:true}).click();
  await expect(date).toHaveValue('2026-09-24');
  await page.reload();await expect(date).toHaveValue('2026-09-24');
  await page.getByRole('button',{name:'Foco',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Jornada',exact:true}).click();
  await expect(date).toHaveValue('2026-09-24');
  await page.getByRole('button',{name:'Hoy',exact:true}).click();
  await expect(date).toHaveValue('2026-10-15');
  await page.reload();await expect(date).toHaveValue('2026-10-15');
});
test('fecha inválida guardada vuelve a hoy',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00'));
  await page.addInitScript(()=>localStorage.setItem('jornada.selectedDate','2026-02-30'));
  await page.goto('/#/jornada');
  await expect(page.getByLabel('Fecha de jornada')).toHaveValue('2026-10-15');
});
