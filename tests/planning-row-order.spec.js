import { test, expect } from '@playwright/test';
import { document as empty, task, block } from '../src/model.js';

async function setup(page, reducedMotion) {
  await page.emulateMedia({reducedMotion});
  await page.clock.install({time:new Date('2026-10-22T18:00:00')});
  await page.clock.pauseAt(new Date('2026-10-22T18:00:00'));
  const previous=empty(), plan=empty();
  const overnight={...task([]),code:'t6',name:'Continuación',estimate:'01:57'};
  previous.tasks.push(overnight);
  previous.blocks.push({...block(),taskIds:[overnight.id],start:'23:00',end:'00:57',endDay:1,focusStates:{[overnight.id]:'finished'}});
  for (const [code,start] of [['t1','10:01'],['t3','14:00'],['t2','15:41'],['t4','19:00']]) {
    const item={...task(plan.tasks),code,name:code};plan.tasks.push(item);
    plan.blocks.push({...block(),taskIds:[item.id],start,end:''});
  }
  await page.addInitScript(data=>{
    if(!localStorage.getItem('jornada.v1')) localStorage.setItem('jornada.v1',JSON.stringify(data));
    localStorage.setItem('jornada.selectedDate','2026-10-22');
  },{version:2,tasks:[],days:{'2026-10-21':{plan:previous,actual:null},'2026-10-22':{plan,actual:null}}});
  await page.goto('/#/jornada');
  await expect.poll(()=>codes(page)).toEqual(['t6','t1','t3','t2','t4']);
  // Keep an intentionally unsorted edit active until the table loses focus.
  await page.getByLabel('Tarea 2: Hora inicio',{exact:true}).fill('20:00');
}
const codes=page=>page.locator('[data-grid="tasks"][data-col="0"]').evaluateAll(inputs=>inputs.map(input=>input.value));

for (const reducedMotion of ['reduce','no-preference']) {
  test(`agregar conserva continuación, orden y foco; ordena solo al salir (${reducedMotion})`,async({page})=>{
    await setup(page,reducedMotion);
    await page.getByRole('button',{name:'+ Tarea',exact:true}).click();
    await expect.poll(()=>codes(page)).toEqual(['t6','t1','t3','t2','t4','t5']);
    await expect(page.getByLabel('Tarea 6: Identificador',{exact:true})).toBeFocused();
    await page.getByLabel('Tarea 6: Descripción',{exact:true}).fill('Nueva tarea');
    await expect.poll(()=>codes(page)).toEqual(['t6','t1','t3','t2','t4','t5']);
    await page.getByRole('button',{name:'+ Tarea',exact:true}).focus();
    await expect.poll(()=>codes(page)).toEqual(['t6','t1','t3','t2','t4','t5']);
    await page.getByRole('button',{name:'Jornada',exact:true}).focus();
    await expect.poll(()=>codes(page)).toEqual(['t6','t3','t2','t4','t1','t5']);
  });

  for (const removed of ['t3','t6']) {
    test(`eliminar ${removed} conserva orden y foco dentro de la grilla (${reducedMotion})`,async({page})=>{
      await setup(page,reducedMotion);
      await page.getByRole('button',{name:`Eliminar ${removed}`,exact:true}).click();
      await expect(page.getByRole('dialog',{name:'Eliminar tarea'}).getByRole('button',{name:'Eliminar',exact:true})).toBeFocused();
      await expect(page.getByRole('dialog',{name:'Eliminar tarea'}).getByRole('button',{name:'Eliminar',exact:true})).toHaveCSS('outline-style','solid');
      await page.keyboard.press('Enter');
      const expected=['t6','t1','t3','t2','t4'].filter(code=>code!==removed);
      await expect.poll(()=>codes(page)).toEqual(expected);
      const index=removed==='t3'?2:0;
      await expect(page.getByLabel(`Tarea ${index+1}: Identificador`,{exact:true})).toBeFocused();
      await page.getByRole('button',{name:'Jornada',exact:true}).focus();
      await expect.poll(()=>codes(page)).toEqual(['t6','t3','t2','t4','t1'].filter(code=>code!==removed));
    });
  }
}

test('confirmación recupera el foco si se pierde al abrir y respeta luego el teclado',async({page})=>{
  await setup(page,'no-preference');
  await page.evaluate(()=>{
    const show=HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal=function(){
      show.call(this);
      queueMicrotask(()=>document.activeElement?.blur());
    };
  });
  await page.getByRole('button',{name:'Eliminar t3',exact:true}).click();
  await page.clock.runFor(32);
  const dialog=page.getByRole('dialog',{name:'Eliminar tarea'});
  await expect(dialog.getByRole('button',{name:'Eliminar',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.clock.runFor(500);
  await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.clock.runFor(500);
  await expect(page.getByRole('button',{name:'Eliminar t3',exact:true})).toBeFocused();
  await expect.poll(()=>codes(page)).toEqual(['t6','t1','t3','t2','t4']);
});
