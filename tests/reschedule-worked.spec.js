import {test,expect} from '@playwright/test';
import {document as newDocument,task,block} from '../src/model.js';
for (const [input,expected] of [['00:00',0],['01:30',90],['3',180]]) {
  test(`Reprogramar registra solo ${input} de trabajo indicado`,async({page},testInfo)=>{
    await page.clock.setFixedTime(new Date('2026-10-15T22:00:00'));
    const plan=newDocument();const t={...task([]),name:'Modelo de dominio',estimate:'03:00'};
    plan.tasks.push(t);plan.blocks.push({...block(),taskIds:[t.id],start:'18:00',end:'21:00'});
    await page.addInitScript(data=>localStorage.setItem('jornada.v1',JSON.stringify(data)),{version:2,tasks:[],days:{'2026-10-15':{plan,actual:null}}});
    await page.goto('/#/foco');
    await page.getByRole('button',{name:'Continuar',exact:true}).click();
    await page.getByRole('button',{name:'Reprogramar tarea',exact:true}).click();
    const dialog=page.locator('dialog[open]');
    await expect(dialog.getByLabel('Tiempo trabajado')).toHaveValue('00:00');
    await dialog.getByLabel('Día',{exact:true}).fill('2026-10-16');
    await dialog.getByLabel('Hora',{exact:true}).fill('09:00');
    await dialog.getByLabel('Tiempo trabajado').fill('99:00');
    await dialog.getByRole('button',{name:'Reprogramar',exact:true}).click();
    await expect(dialog.getByRole('alert')).toContainText('tiempo transcurrido');
    await dialog.getByLabel('Tiempo trabajado').fill(input);
    await dialog.getByLabel('Tiempo trabajado').blur();
    if (input === '3') await expect(dialog.getByLabel('Tiempo trabajado')).toHaveValue('03:00');
    if (input === '01:30') await page.screenshot({path:testInfo.outputPath('tiempo-trabajado.png')});
    await dialog.getByRole('button',{name:'Reprogramar',exact:true}).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('#saved')).toHaveText('Guardado');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('jornada.v1')));
    const actual=saved.days['2026-10-15'].actual;
    if (!expected) expect(actual).toBeNull();
    else {
      expect(actual.blocks).toHaveLength(1);
      expect(actual.blocks[0].start).toBe('18:00');
      expect(actual.blocks[0].end).toBe(expected===90?'19:30':'21:00');
    }
    expect(saved.days['2026-10-16'].plan.tasks[0].estimate).toBe('03:00');
    await page.getByRole('button',{name:'Historia',exact:true}).click();
    await expect(page.locator('#history-actual')).toHaveText(`${Math.floor(expected/60)}:${String(expected%60).padStart(2,'0')} hs`);
  });
}
