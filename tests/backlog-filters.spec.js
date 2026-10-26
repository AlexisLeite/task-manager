import { chooseValue, expectValue } from "./helpers/combo.js";
import { test, expect } from "@playwright/test";
import { task } from "../src/model.js";
const read = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("jornada.v1")));
const rows = (page) => page.locator("#backlog-list tr");
async function seed(page) {
  const backlog = [
    ["Revisar código", "a"],
    ["Preparar reunión", "b"],
    ["Escribir reglas", "a"],
    ["Comprar café", ""],
  ].map(([name, projectId]) => ({ ...task([]), name, projectId }));
  await page.addInitScript(
    (data) => {
      if (!localStorage.getItem("jornada.v1"))
        localStorage.setItem("jornada.v1", JSON.stringify(data));
    },
    {
      version: 2,
      tasks: [],
      days: {},
      projects: [
        { id: "b", name: "Zeta" },
        { id: "a", name: "Álamo" },
      ],
      backlog,
    },
  );
  await page.goto("/#/backlog");
  return backlog;
}
for (const reducedMotion of ["reduce", "no-preference"])
  test(`filtrar y buscar conserva filas, foco y datos (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const backlog = await seed(page);
    const search = page.getByRole("searchbox", { name: "Buscar en backlog" });
    const filter = page.getByLabel("Filtrar backlog por proyecto", {
      exact: true,
    });
    await page.evaluate(
      () =>
        (window.originalBacklogInput = document.querySelector(
          '[data-backlog-field="name"]',
        )),
    );
    await chooseValue(page, filter, "a");
    await expect(rows(page)).toHaveCount(2);
    await expect(
      rows(page).nth(0).getByLabel("Descripción de tarea"),
    ).toHaveValue("Revisar código");
    await rows(page).nth(0).getByLabel("Descripción de tarea").focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      rows(page).nth(1).getByLabel("Descripción de tarea"),
    ).toBeFocused();
    await search.fill("CODIGO");
    await expect(rows(page)).toHaveCount(1);
    await expect(search).toBeFocused();
    await expect(
      rows(page).first().getByLabel("Descripción de tarea"),
    ).toHaveValue("Revisar código");
    await chooseValue(page, filter, "b");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator("#backlog-empty")).toBeVisible();
    await search.fill("reunion zeta");
    await expect(rows(page)).toHaveCount(1);
    await search.fill("ALAMO");
    await expect(rows(page)).toHaveCount(0);
    await page
      .getByRole("button", { name: "Limpiar filtros", exact: true })
      .click();
    await expect(rows(page)).toHaveCount(4);
    expect(
      await page.evaluate(
        () =>
          document.querySelector('[data-backlog-field="name"]') ===
          window.originalBacklogInput,
      ),
    ).toBe(true);
    expect((await read(page)).backlog).toEqual(backlog);
    await chooseValue(page, filter, "");
    await expect(rows(page)).toHaveCount(1);
    await expect(
      rows(page).first().getByLabel("Descripción de tarea"),
    ).toHaveValue("Comprar café");
    await page.getByRole("button", { name: "Proyectos", exact: true }).click();
    await page.getByRole("button", { name: "Backlog", exact: true }).click();
    await expectValue(filter, "");
    await expect(rows(page)).toHaveCount(1);
  });

test("selección y eliminación solo afectan las filas filtradas; crear y pegar conserva las ocultas", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const original = await seed(page);
  const filter = page.getByLabel("Filtrar backlog por proyecto", {
    exact: true,
  });
  await chooseValue(page, filter, "a");
  const first = rows(page).first().getByLabel("Descripción de tarea");
  await first.focus();
  await first.press("Shift+Space");
  await first.press("Shift+ArrowDown");
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog", { name: "Eliminar tarea" });
  await expect(dialog).toContainText("Revisar código, Escribir reglas");
  await dialog
    .getByRole("button", { name: "Eliminar", exact: true })
    .press("Enter");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  let data = await read(page);
  expect(data.backlog).toEqual([original[1], original[3]]);
  await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
  await expect(
    rows(page).first().getByLabel("Descripción de tarea"),
  ).toBeFocused();
  await expectValue(
    rows(page)
      .first()
      .getByRole("combobox", { name: "Proyecto de tarea", exact: true }),
    "a",
  );
  await page.evaluate(() =>
    navigator.clipboard.writeText("Nueva\tÁlamo\t00:30\nSegunda\tÁlamo\t01:00"),
  );
  await page.keyboard.press("Control+v");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  data = await read(page);
  expect(data.backlog.slice(0, 2)).toEqual([original[1], original[3]]);
  expect(
    data.backlog.slice(2).map((t) => [t.name, t.projectId, t.estimate]),
  ).toEqual([
    ["Nueva", "a", "00:30"],
    ["Segunda", "a", "01:00"],
  ]);
  await rows(page)
    .last()
    .getByLabel("Descripción de tarea")
    .press("Alt+ArrowUp");
  await expect(
    rows(page).first().getByLabel("Descripción de tarea"),
  ).toHaveValue("Segunda");
  expect((await read(page)).backlog.slice(0, 2)).toEqual([
    original[1],
    original[3],
  ]);
});

test("buscar no interrumpe la edición y agregar permite completar una tarea nueva con filtros activos", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  const search = page.getByRole("searchbox", { name: "Buscar en backlog" });
  await search.fill("revisar");
  const input = rows(page).first().getByLabel("Descripción de tarea");
  await input.fill("Cambiar nombre");
  await expect(input).toBeFocused();
  await expect(rows(page)).toHaveCount(1);
  await input.press("Control+Enter");
  await expect(rows(page)).toHaveCount(2);
  const added = rows(page).last().getByLabel("Descripción de tarea");
  await expect(added).toBeFocused();
  await added.fill("Revisar nueva");
  await search.focus();
  await expect(rows(page)).toHaveCount(1);
  await expect(
    rows(page).first().getByLabel("Descripción de tarea"),
  ).toHaveValue("Revisar nueva");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  expect((await read(page)).backlog.map((t) => t.name)).toContain(
    "Cambiar nombre",
  );
});
