import { test, expect } from '@playwright/test';
import { example } from '../src/model.js';

test.use({deviceScaleFactor:1.25});
test('barras alineadas a píxeles físicos después de filtros y resize', async ({page}) => {
  await page.addInitScript(plan => localStorage.setItem('jornada.v1',JSON.stringify({version:2,tasks:[],days:{'2026-10-15':{plan,actual:plan}}})),example());
  await page.goto('/#/historia');
  const aligned = () => page.locator('.history-task-track > span').evaluateAll(bars => bars.length > 0 && bars.every(bar => {
    const rect = bar.getBoundingClientRect();
    return [rect.left,rect.top,rect.width,rect.height].every(n => Math.abs(n*devicePixelRatio-Math.round(n*devicePixelRatio))<.03);
  }));
  await expect.poll(aligned).toBe(true);
  await page.getByRole('button',{name:'Filtros',exact:true}).click();
  await page.getByLabel('Desde',{exact:true}).fill('2026-10-15');
  await expect.poll(aligned).toBe(true);
  await page.setViewportSize({width:931,height:737});
  await expect.poll(aligned).toBe(true);
  const heights = await page.locator('.history-task-track > span').evaluateAll(bars=>bars.map(bar=>bar.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
});
