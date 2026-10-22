import { test, expect } from '@playwright/test';
import { document as empty, task, block } from '../src/model.js';

test('Play a medianoche coloca la nueva instancia antes de la tarea de la 01:00', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-22T00:00:00')});
  await page.clock.pauseAt(new Date('2026-10-22T00:00:00'));
  const previous=empty(),today=empty();
  const old={...task([]),name:'Trabajo anterior',estimate:'01:00'};
  previous.tasks.push(old);
  previous.blocks.push({...block(),taskIds:[old.id],start:'22:00',end:'23:00',focusStates:{[old.id]:'finished'}});
  const future={...task([]),name:'Trabajo de la una',estimate:'01:00'};
  today.tasks.push(future);
  today.blocks.push({...block(),taskIds:[future.id],start:'01:00',end:'02:00'});
  await page.addInitScript(data=>{
    localStorage.setItem('jornada.v1',JSON.stringify(data));
    localStorage.setItem('jornada.selectedDate','2026-10-21');
  },{version:2,tasks:[],days:{'2026-10-21':{plan:previous,actual:null},'2026-10-22':{plan:today,actual:null}}});
  await page.goto('/#/jornada');
  await page.getByRole('button',{name:'Iniciar t1',exact:true}).click();
  await expect(page.getByLabel('Fecha de jornada')).toHaveValue('2026-10-22');
  await expect(page.locator('[data-grid="tasks"][data-col="5"]').first()).toHaveValue('00:00');
  await expect(page.locator('[data-grid="tasks"][data-col="5"]').last()).toHaveValue('01:00');
  await expect(page.locator('[data-grid="tasks"][data-col="3"]').first()).toHaveValue('Trabajo anterior');
});
