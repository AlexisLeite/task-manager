import { test, expect } from '@playwright/test';

test('Filtros abre debajo del encabezado y tolera invertir el acordeón a mitad de animación', async ({ page }) => {
  await page.goto('/#/historia');
  const toggle = page.locator('#history-filter-toggle');
  const panel = page.locator('#history-date-filters');
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => document.getElementById('history-date-filters').getAnimations().forEach(animation => animation.finish()));
  const gap = await page.evaluate(() => document.querySelector('.history-filters input').getBoundingClientRect().top - document.querySelector('.history-header').getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(12);
  await page.evaluate(() => {
    const toggle = document.getElementById('history-filter-toggle');
    const panel = document.getElementById('history-date-filters');
    toggle.click();
    const closing = panel.getAnimations()[0];
    closing.pause();
    closing.currentTime = 140;
    toggle.click();
    panel.getAnimations().forEach(animation => animation.finish());
  });
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
