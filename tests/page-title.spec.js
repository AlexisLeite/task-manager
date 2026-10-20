import { test, expect } from '@playwright/test';
import { document as empty, task, block, minutes, time } from '../src/model.js';

async function setup(page, entries, now = '2026-10-16T10:00:00', date = '2026-10-16') {
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now));
  const plan = empty();
  for (const [name, start, end, extra = {}] of entries) {
    const definition = { ...task(plan.tasks), name, estimate: end ? time(minutes(end) - minutes(start)) : '', projectId: extra.projectId || '' };
    plan.tasks.push(definition);
    plan.blocks.push({ ...block(), taskIds: [definition.id], start, end, ...extra });
  }
  await page.addInitScript(data => {
    if (!localStorage.getItem('jornada.v1')) localStorage.setItem('jornada.v1', JSON.stringify(data));
  }, { version: 2, tasks: [], projects: [{id:'old',name:'Proyecto principal'}, {id:'new',name:'Otro proyecto'}], days: { [date]: { plan, actual: null } } });
  await page.goto('/#/foco');
}

test('título usa la tarea que lleva más tiempo y avanza en todas las vistas', async ({ page }) => {
  await setup(page, [['Más reciente', '09:30', '10:30', {projectId:'new'}], ['Más antigua', '08:00', '12:00', {projectId:'old'}]]);
  await expect(page).toHaveTitle('Work Track - 02:00:00 - Proyecto principal');
  await page.clock.runFor(2000);
  await expect(page).toHaveTitle('Work Track - 02:00:02 - Proyecto principal');
  await page.getByRole('button', { name: 'Jornada', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page).toHaveTitle('Work Track - 02:00:03 - Proyecto principal');
  await page.getByRole('button', { name: 'Pausar el tiempo', exact: true }).click();
  await page.clock.fastForward(10000);
  await expect(page).toHaveTitle('Work Track - 02:00:03 - Proyecto principal');
});

test('Idle excluye futuras y vencidas, empieza y termina en el segundo correcto', async ({ page }) => {
  await setup(page, [['Vencida', '07:00', '08:00'], ['Próxima', '10:01', '10:02']]);
  await expect(page).toHaveTitle('Work Track - Idle');
  await page.clock.runFor(60000);
  await expect(page).toHaveTitle('Work Track - 00:00:00 - Sin proyecto');
  await page.clock.runFor(60000);
  await expect(page).toHaveTitle('Work Track - Idle');
});

test('completar una tarea actualiza el título de inmediato', async ({ page }) => {
  await setup(page, [['Trabajo', '09:00', '11:00']]);
  await expect(page).toHaveTitle('Work Track - 01:00:00 - Sin proyecto');
  await page.getByLabel('Opciones de Trabajo', { exact: true }).click();
  await page.getByRole('button', { name: 'Terminar tarea', exact: true }).click();
  await expect(page).toHaveTitle('Work Track - Idle');
});

test('tarea abierta de días anteriores conserva horas transcurridas mayores que 24', async ({ page }) => {
  await setup(page, [['Sin fin', '08:00', '', { openStarted: true }]], '2026-10-16T10:00:00', '2026-10-15');
  await expect(page).toHaveTitle('Work Track - 26:00:00 - Sin proyecto');
});
