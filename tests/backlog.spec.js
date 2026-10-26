import { test, expect } from "@playwright/test";
import {
  document as empty,
  task,
  block,
  validate,
  normalizeDocument,
} from "../src/model.js";

const read = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("jornada.v1")));
async function seed(page, data) {
  await page.clock.install({ time: new Date("2026-10-26T10:00:00") });
  await page.clock.pauseAt(new Date("2026-10-26T10:00:00"));
  await page.addInitScript((data) => {
    if (!localStorage.getItem("jornada.v1"))
      localStorage.setItem("jornada.v1", JSON.stringify(data));
  }, data);
}
for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`Backlog agrega, edita, inicia sin duplicar y retira al terminar (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await seed(page, {
      version: 2,
      tasks: [],
      days: {},
      projects: [{ id: "p", name: "POC" }],
    });
    await page.goto("/#/backlog");
    await expect(page.getByRole("columnheader")).toHaveText([
      "Tarea",
      "Proyecto",
      "Duración",
      "",
    ]);
    await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
    const first = page.locator("#backlog-list tr").first();
    await expect(
      first.locator("td").last().locator("[data-backlog-play]"),
    ).toBeVisible();
    await expect(
      first.locator("td").last().locator("[data-backlog-remove]"),
    ).toBeVisible();
    await expect(
      first.getByLabel("Descripción de tarea", { exact: true }),
    ).toBeFocused();
    await first
      .getByLabel("Descripción de tarea", { exact: true })
      .fill("Reglas");
    await first
      .getByLabel("Proyecto de tarea", { exact: true })
      .selectOption("p");
    await first.getByLabel("Duración de tarea", { exact: true }).fill("00:45");
    await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
    await page
      .locator("#backlog-list tr")
      .last()
      .getByLabel("Descripción de tarea", { exact: true })
      .fill("Sin tiempo");
    await expect(page.locator("#backlog-list tr")).toHaveCount(2);
    await first
      .getByLabel("Descripción de tarea", { exact: true })
      .fill("Reglas POC");
    await first.getByLabel("Duración de tarea", { exact: true }).fill("01:00");
    await first.getByLabel("Proyecto de tarea", { exact: true }).focus();
    await expect(
      first.getByLabel("Duración de tarea", { exact: true }),
    ).toHaveValue("01:00");
    await page.reload();
    await expect(
      first.getByLabel("Descripción de tarea", { exact: true }),
    ).toHaveValue("Reglas POC");
    await page
      .getByRole("button", { name: "Iniciar Reglas POC", exact: true })
      .click();
    await expect(
      page.getByRole("table", { name: "Tareas de la jornada" }),
    ).toBeVisible();
    await expect(page.locator("#saved")).toHaveText("Guardado");
    let data = await read(page);
    validate(data);
    expect(data.backlog).toHaveLength(2);
    expect(data.days["2026-10-26"].plan.blocks[0]).toMatchObject({
      start: "10:00",
      end: "11:00",
    });
    expect(data.days["2026-10-26"].plan.tasks[0].projectId).toBe("p");
    await page.getByRole("button", { name: "Backlog", exact: true }).click();
    await page
      .getByRole("button", { name: "Iniciar Reglas POC", exact: true })
      .click();
    expect((await read(page)).days["2026-10-26"].plan.tasks).toHaveLength(1);
    await page.clock.fastForward(15 * 60000);
    await page
      .getByRole("button", { name: "Terminar t1", exact: true })
      .click();
    await expect(page.locator("#saved")).toHaveText("Guardado");
    data = await read(page);
    expect(data.backlog.map((t) => t.name)).toEqual(["Sin tiempo"]);
    expect(data.days["2026-10-26"].actual.blocks).toHaveLength(1);
    await page.getByRole("button", { name: "Backlog", exact: true }).click();
    await page
      .getByRole("button", { name: "Iniciar Sin tiempo", exact: true })
      .click();
    await page.clock.fastForward(10 * 60000);
    await page.getByRole("button", { name: "Foco", exact: true }).click();
    await page.getByLabel("Opciones de Sin tiempo", { exact: true }).click();
    await page
      .getByRole("button", { name: "Terminar tarea", exact: true })
      .click();
    await expect(page.locator("#saved")).toHaveText("Guardado");
    data = await read(page);
    expect(data.backlog).toHaveLength(0);
    expect(data.days["2026-10-26"].actual.blocks).toHaveLength(2);
    await page.getByRole("button", { name: "Backlog", exact: true }).click();
    await expect(page.locator("#backlog-list tr")).toHaveCount(0);
  });
}

test("Enviar tareas programadas, compartidas, en ejecución y terminadas conserva el trabajo", async ({
  page,
}) => {
  const plan = empty();
  const pending = {
    ...task([]),
    name: "Pendiente",
    code: "t1",
    estimate: "00:30",
  };
  const running = { ...task([]), name: "En curso", code: "t2" };
  const other = { ...task([]), name: "Paralela", code: "t3" };
  plan.tasks = [pending, running, other];
  plan.blocks = [
    { ...block(), taskIds: [pending.id], start: "12:00", end: "12:30" },
    {
      ...block(),
      taskIds: [running.id, other.id],
      start: "09:00",
      end: "",
      openStarted: true,
    },
  ];
  await seed(page, {
    version: 2,
    tasks: [],
    days: { "2026-10-26": { plan, actual: null } },
  });
  await page.goto("/#/jornada");
  await page.evaluate(() => {
    window.backlogTransitions = 0;
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      window.backlogTransitions++;
      return original(...args);
    };
  });
  await page
    .getByRole("button", { name: "Enviar t1 al backlog", exact: true })
    .click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  let data = await read(page);
  expect(data.backlog.map((t) => t.name)).toEqual(["Pendiente"]);
  expect(data.days["2026-10-26"].plan.tasks).toHaveLength(2);
  expect(data.days["2026-10-26"].actual).toBeNull();
  await page
    .getByRole("button", { name: "Enviar t2 al backlog", exact: true })
    .click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  data = await read(page);
  validate(data);
  const actual = structuredClone(data.days["2026-10-26"].actual);
  expect(actual.blocks[0]).toMatchObject({ start: "09:00", end: "10:00" });
  expect(
    data.days["2026-10-26"].plan.blocks.find((b) =>
      b.taskIds.includes(other.id),
    ),
  ).toMatchObject({ start: "09:00", end: "", openStarted: true });
  expect(data.backlog.map((t) => t.name)).toEqual(["Pendiente", "En curso"]);
  expect(await page.evaluate(() => window.backlogTransitions)).toBe(0);
  await page
    .getByRole("button", { name: "Enviar t2 al backlog", exact: true })
    .click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  expect((await read(page)).backlog).toHaveLength(2);
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await page
    .getByRole("button", { name: "Iniciar En curso", exact: true })
    .click();
  await page.clock.fastForward(30 * 60000);
  await page.getByRole("button", { name: "Terminar t1", exact: true }).click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  data = await read(page);
  expect(data.backlog.map((t) => t.name)).toEqual(["Pendiente"]);
  expect(data.days["2026-10-26"].actual.blocks).toHaveLength(2);
  expect(data.days["2026-10-26"].actual.blocks[0]).toEqual(actual.blocks[0]);
});

test("Completar desde estado, pausar y cruzar medianoche mantiene el vínculo al backlog", async ({
  page,
}) => {
  const entry = { ...task([]), name: "Nocturna" };
  await seed(page, { version: 2, tasks: [], days: {}, backlog: [entry] });
  await page.goto("/#/backlog");
  await page.clock.fastForward(13.5 * 3600000);
  await page
    .getByRole("button", { name: "Iniciar Nocturna", exact: true })
    .click();
  await page.clock.fastForward(10 * 60000);
  await page.locator("#clock-toggle").click();
  await page.clock.fastForward(10 * 60000);
  await page.locator("#clock-toggle").click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  expect((await read(page)).backlog).toHaveLength(1);
  await page.clock.fastForward(30 * 60000);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await page.getByLabel("Opciones de Nocturna", { exact: true }).click();
  await page
    .getByRole("button", { name: "Terminar tarea", exact: true })
    .click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const data = await read(page);
  validate(data);
  expect(data.backlog).toHaveLength(0);
  expect(data.days["2026-10-26"].actual.blocks).toHaveLength(2);
  expect(data.days["2026-10-27"].actual.blocks).toHaveLength(1);
});

test("Completar una tarea programada desde Jornada retira solo su entrada del backlog", async ({
  page,
}) => {
  const entry = { ...task([]), name: "Programada", estimate: "01:00" };
  const unrelated = { ...task([]), name: "Programada" };
  const plan = empty();
  const scheduled = { ...entry, id: "scheduled", backlogId: entry.id };
  plan.tasks = [scheduled];
  plan.blocks = [
    { ...block(), taskIds: [scheduled.id], start: "08:00", end: "09:00" },
  ];
  await seed(page, {
    version: 2,
    tasks: [],
    days: { "2026-10-25": { plan, actual: null } },
    backlog: [entry, unrelated],
  });
  await page.goto("/#/jornada");
  await page.getByLabel("Fecha de jornada").fill("2026-10-25");
  await page
    .getByRole("button", { name: "Cambiar estado de t1", exact: true })
    .click();
  await page.getByRole("option", { name: "Completada", exact: true }).click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const data = await read(page);
  validate(data);
  expect(data.backlog.map((t) => t.id)).toEqual([unrelated.id]);
  expect(data.days["2026-10-25"].actual.blocks[0]).toMatchObject({
    start: "08:00",
    end: "09:00",
  });
});

test("Grilla de tres columnas: teclado, selección, pegar, reordenar, retirar y deshacer", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, {
    version: 2,
    tasks: [],
    days: {},
    projects: [{ id: "p", name: "POC" }],
  });
  await page.goto("/#/backlog");
  await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
  const cells = () => page.locator("[data-backlog-field]");
  await expect(cells().nth(0)).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Iniciar tarea", exact: true }),
  ).toBeDisabled();
  await cells().nth(0).fill("Primera");
  await cells().nth(0).press("Control+Shift+ArrowRight");
  await expect(cells().nth(1)).toBeFocused();
  await cells().nth(1).press("Enter");
  await page.getByRole("combobox", { name: "Filtrar opciones" }).fill("POC");
  await page.getByRole("combobox", { name: "Filtrar opciones" }).press("Enter");
  await expect(cells().nth(1)).toBeFocused();
  await expect(cells().nth(1)).toHaveValue("p");
  await cells().nth(1).press("ArrowRight");
  await expect(cells().nth(2)).toBeFocused();
  await cells().nth(2).fill("130");
  await cells().nth(2).press("Enter");
  await expect(cells().nth(5)).toBeFocused();
  await expect(cells().nth(2)).toHaveValue("01:30");
  await cells().nth(5).press("Home");
  await expect(cells().nth(3)).toBeFocused();
  await cells().nth(3).fill("Segunda");
  await cells().nth(3).press("Control+Enter");
  await expect(cells().nth(6)).toBeFocused();
  await cells().nth(6).fill("Tercera");
  await cells().nth(6).press("Alt+ArrowUp");
  await expect(cells().nth(3)).toHaveValue("Tercera");
  await expect(cells().nth(3)).toBeFocused();
  await cells().nth(3).press("Shift+Space");
  await cells().nth(3).press("Shift+ArrowDown");
  await expect(page.locator("#backlog-list tr.selected")).toHaveCount(2);
  await cells().nth(6).press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Tercera\t\t\nSegunda\t\t",
  );
  await cells().nth(6).press("Delete");
  const confirmation = page.getByRole("dialog", {
    name: "Eliminar tarea",
    exact: true,
  });
  await expect(
    confirmation.getByRole("button", { name: "Eliminar", exact: true }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Eliminar", exact: true })
    .press("Enter");
  await expect(page.locator("#backlog-list tr")).toHaveCount(1);
  await cells().nth(0).press("Control+z");
  await expect(page.locator("#backlog-list tr")).toHaveCount(3);
  await cells().nth(3).focus();
  await page.evaluate(() =>
    navigator.clipboard.writeText("Pegada\tPOC\t00:20\nOtra\t\t"),
  );
  await cells().nth(3).press("Control+v");
  await expect(cells().nth(3)).toHaveValue("Pegada");
  await expect(cells().nth(4)).toHaveValue("p");
  await expect(cells().nth(5)).toHaveValue("00:20");
  await expect(cells().nth(6)).toHaveValue("Otra");
  await expect(cells().nth(3)).toBeFocused();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const data = await read(page);
  validate(data);
  expect(data.backlog.map((t) => t.name)).toEqual([
    "Primera",
    "Pegada",
    "Otra",
  ]);
  await page.reload();
  await expect(cells().nth(3)).toHaveValue("Pegada");
});

test("Papelera de Backlog confirma, enfoca Eliminar, permite cancelar y conserva la ejecución", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const entry = { ...task([]), name: "En curso" };
  const plan = empty(),
    scheduled = { ...entry, id: "execution", backlogId: entry.id };
  plan.tasks = [scheduled];
  plan.blocks = [
    {
      ...block(),
      taskIds: [scheduled.id],
      start: "09:00",
      end: "",
      openStarted: true,
      endDay: 0,
    },
  ];
  normalizeDocument(plan);
  await seed(page, {
    version: 2,
    tasks: [],
    backlog: [entry],
    days: { "2026-10-26": { plan, actual: null } },
  });
  await page.goto("/#/backlog");
  const trash = page.getByRole("button", {
    name: "Eliminar En curso",
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: "Eliminar tarea",
    exact: true,
  });
  const readPlan = async () => (await read(page)).days["2026-10-26"];
  const previous = await readPlan();
  await expect(trash.locator("svg path")).toHaveAttribute(
    "d",
    "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  );
  await trash.click();
  await expect(
    dialog.getByRole("button", { name: "Eliminar", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trash).toBeFocused();
  expect((await read(page)).backlog).toHaveLength(1);
  await trash.click();
  await dialog.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trash).toBeFocused();
  await trash.click();
  await dialog
    .getByRole("button", { name: "Eliminar", exact: true })
    .press("Enter");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  expect((await read(page)).backlog).toHaveLength(0);
  expect(await readPlan()).toEqual(previous);
  await expect(
    page.getByRole("button", { name: "+ Tarea", exact: true }),
  ).toBeFocused();
});
