import { test, expect } from '@playwright/test';

test('lápiz en hover permite renombrar con Enter o blur y cancelar con Escape', async ({ page }) => {
  await page.goto('/#/proyectos');
  const add = page.getByLabel('Nombre del proyecto', { exact: true });
  for (const name of ['Apia', 'Otro']) {
    await add.fill(name);
    await add.press('Enter');
  }
  const row = page.locator('#project-list li').first();
  const id = await row.getAttribute('data-project-id');
  const pencil = row.getByRole('button');
  await expect(pencil).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(pencil).toHaveCSS('opacity', '1');
  await expect.poll(async () => page.locator('.project-edit').evaluateAll(nodes => {
    const [a,b] = nodes.map(node => node.getBoundingClientRect());
    return Math.abs(a.x-b.x) + Math.abs(a.width-b.width);
  })).toBeLessThan(0.1);
  await pencil.click();
  const editor = page.getByLabel('Título del proyecto', { exact: true });
  await expect(editor).toBeFocused();
  await editor.fill('Apia nuevo');
  await editor.press('Enter');
  await expect(row.locator('.project-title')).toHaveText('Apia nuevo');
  await expect(row).toHaveAttribute('data-project-id', id);
  await pencil.click();
  await editor.fill('Descartar');
  await editor.press('Escape');
  await expect(row.locator('.project-title')).toHaveText('Apia nuevo');
  await pencil.click();
  await editor.fill('Otro');
  await editor.press('Enter');
  await expect(editor).toBeVisible();
  expect(await editor.evaluate(input => input.validationMessage)).toContain('ya existe');
  await editor.fill('');
  await editor.press('Enter');
  expect(await editor.evaluate(input => input.validationMessage)).toContain('nombre');
  await editor.fill('Apia final');
  await add.click();
  await expect(row.locator('.project-title')).toHaveText('Apia final');
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.reload();
  await expect(row.locator('.project-title')).toHaveText('Apia final');
  await expect(row).toHaveAttribute('data-project-id', id);
});
