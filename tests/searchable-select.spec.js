import { test, expect } from "@playwright/test";
import { document as empty, task, block } from "../src/model.js";

async function seed(page) {
  await page.clock.install({ time: new Date("2026-10-26T10:00:00") });
  const plan = empty();
  plan.tasks = [
    { ...task([]), name: "Reglas", estimate: "02:00" },
    { ...task([]), name: "Segunda", code: "t2", estimate: "01:00" },
  ];
  plan.blocks = plan.tasks.map((t) => ({
    ...block(),
    taskIds: [t.id],
    start: "09:00",
    end: "11:00",
  }));
  const actual = structuredClone(plan);
  actual.tasks[0].projectId = "a";
  actual.tasks[1].projectId = "b";
  await page.addInitScript(
    (data) => {
      if (!localStorage.getItem("jornada.v1"))
        localStorage.setItem("jornada.v1", JSON.stringify(data));
    },
    {
      version: 2,
      tasks: [],
      projects: [
        { id: "a", name: "Álamo" },
        { id: "b", name: "Beta" },
      ],
      backlog: [
        { ...task([]), name: "Pendiente A", projectId: "a" },
        { ...task([]), name: "Pendiente B", projectId: "b" },
      ],
      days: { "2026-10-26": { plan, actual } },
    },
  );
}
async function choose(page, label, query, option) {
  const combo = page.getByRole("combobox", { name: label, exact: true });
  await combo.click();
  await combo.fill(query);
  await page.getByRole("option", { name: option, exact: true }).click();
  return combo;
}
const read = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("jornada.v1")));
for (const reducedMotion of ["reduce", "no-preference"])
  test(`combos React en Jornada y Backlog buscan y conservan navegación y datos (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await seed(page);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/#/jornada");
    const project = await choose(page, "Tarea 1: Proyecto", "alamo", "Álamo");
    await expect(project).toBeFocused();
    await expect(page.locator("#saved")).toHaveText("Guardado");
    expect((await read(page)).days["2026-10-26"].plan.tasks[0].projectId).toBe(
      "a",
    );
    await project.press("ArrowDown");
    await expect(
      page.getByRole("combobox", { name: "Tarea 2: Proyecto", exact: true }),
    ).toBeFocused();
    const priority = await choose(page, "Tarea 1: Prioridad", "med", "Media");
    await expect(priority).toBeFocused();
    await expect(page.locator("#saved")).toHaveText("Guardado");
    expect((await read(page)).days["2026-10-26"].plan.tasks[0].priority).toBe(
      "Media",
    );
    await priority.press("ArrowRight");
    await expect(
      page.getByLabel("Tarea 1: Identificador", { exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Backlog", exact: true }).click();
    await choose(page, "Filtrar backlog por proyecto", "alamo", "Álamo");
    await expect(page.locator("#backlog-list tr")).toHaveCount(1);
    await choose(page, "Proyecto de tarea", "bet", "Beta");
    await expect(page.locator("#saved")).toHaveText("Guardado");
    expect((await read(page)).backlog[0].projectId).toBe("b");
    await page
      .getByRole("button", { name: "Limpiar filtros", exact: true })
      .click();
    await expect(page.locator("#backlog-list tr")).toHaveCount(2);
    await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
    const row = page.locator("#backlog-list tr").last();
    const combo = row.getByRole("combobox", {
      name: "Proyecto de tarea",
      exact: true,
    });
    await combo.click();
    await combo.fill("alam");
    await page.getByRole("option", { name: "Álamo", exact: true }).click();
    await expect(combo).toBeFocused();
    expect((await read(page)).backlog.at(-1).projectId).toBe("a");
    expect(errors).toEqual([]);
  });

test("prioridad de Foco y selección múltiple de Historia permiten buscar", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  await page.goto("/#/foco");
  await choose(page, "Prioridad de Reglas", "alt", "Alta");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  expect((await read(page)).days["2026-10-26"].plan.tasks[0].priority).toBe(
    "Alta",
  );
  await page.clock.fastForward(1500);
  await page
    .getByRole("combobox", { name: "Prioridad de Reglas", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Prioridad de Reglas", exact: true })
    .fill("baj");
  await page.clock.fastForward(1500);
  await expect(
    page.getByRole("option", { name: "Baja", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Historia", exact: true }).click();
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await choose(page, "Filtrar proyectos de Historia", "alamo", "Álamo");
  await expect(page.locator("#history-actual")).toHaveText("2:00 hs");
  const multi = page.getByRole("combobox", {
    name: "Filtrar proyectos de Historia",
    exact: true,
  });
  await multi.fill("beta");
  await page.getByRole("option", { name: "Beta", exact: true }).click();
  await expect(multi).toBeFocused();
  await expect(page.locator(".combo-summary")).toHaveText("2 proyectos");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Todo el historial", exact: true })
    .click();
  await expect(page.locator(".combo-summary")).toHaveText(
    "Todos los proyectos",
  );
});

test("estado de Jornada también permite buscar y conserva completar y cancelar", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  await page.goto("/#/jornada");
  await choose(page, "Cambiar estado de t1", "cancel", "Cancelada");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  let data = await read(page);
  expect(data.days["2026-10-26"].plan.blocks[0].focusStates).toMatchObject({
    [data.days["2026-10-26"].plan.tasks[0].id]: "cancelled",
  });
  await choose(page, "Cambiar estado de t1", "prog", "Programada");
  await choose(page, "Cambiar estado de t1", "complet", "Completada");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  data = await read(page);
  expect(data.days["2026-10-26"].plan.blocks[0].focusStates).toMatchObject({
    [data.days["2026-10-26"].plan.tasks[0].id]: "finished",
  });
  await expect(
    page.getByRole("combobox", { name: "Cambiar estado de t1", exact: true }),
  ).toHaveCount(0);
});
