import { test, expect } from "@playwright/test";

test("Proyectos ordena al abrir, agregar y renombrar conservando identidad y foco", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    if (!localStorage.getItem("jornada.v1"))
      localStorage.setItem(
        "jornada.v1",
        JSON.stringify({
          version: 2,
          tasks: [],
          days: {},
          projects: [
            { id: "z", name: "Zeta" },
            { id: "a", name: "Álamo" },
            { id: "g", name: "gimnasio" },
          ],
        }),
      );
  });
  await page.goto("/#/proyectos");
  const titles = page.locator("#project-list .project-title");
  await expect(titles).toHaveText(["Álamo", "gimnasio", "Zeta"]);
  const add = page.getByLabel("Nombre del proyecto", { exact: true });
  await add.fill("Beta");
  await add.press("Enter");
  await expect(titles).toHaveText(["Álamo", "Beta", "gimnasio", "Zeta"]);
  await expect(add).toBeFocused();
  const row = page.locator('[data-project-id="z"]');
  await row.getByRole("button", { name: "Editar Zeta", exact: true }).click();
  const editor = page.getByLabel("Título del proyecto", { exact: true });
  await editor.fill("Ábaco");
  await expect(editor).toBeFocused();
  await editor.press("Enter");
  await expect(titles).toHaveText(["Ábaco", "Álamo", "Beta", "gimnasio"]);
  await expect(
    row.getByRole("button", { name: "Editar Ábaco", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await expect(titles).toHaveText(["Ábaco", "Álamo", "Beta", "gimnasio"]);
  await expect(row).toHaveCount(1);
});
