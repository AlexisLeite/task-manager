import { test, expect } from "@playwright/test";
import { example } from "../src/model.js";

test("alta rápida, columna a la derecha, persistencia y filtro múltiple del trabajo real", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-10-15T16:59:59") });
  await page.clock.pauseAt(new Date("2026-10-15T17:00:00"));
  await page.addInitScript((plan) => {
    if (!localStorage.getItem("jornada.v1"))
      localStorage.setItem(
        "jornada.v1",
        JSON.stringify({
          version: 2,
          tasks: [],
          days: { "2026-10-15": { plan, actual: null } },
        }),
      );
  }, example());
  await page.goto("/#/proyectos");
  const name = page.getByRole("textbox", { name: "Nombre del proyecto" });
  for (const project of [
    "Apia",
    "Centro de decisiones",
    "Integración Apia CDD",
  ]) {
    await name.fill(project);
    await name.press("Enter");
    await expect(name).toHaveValue("");
  }
  await name.fill(" apia ");
  await name.press("Enter");
  await expect(page.locator("#project-list li")).toHaveCount(3);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await expect(page.locator("#project-list li")).toHaveCount(3);
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(page.locator('[data-table="tasks"] th').last()).toHaveText(
    "Proyecto",
  );
  const project2 = page.getByLabel("Tarea 2: Proyecto", { exact: true });
  await project2.selectOption({ label: "Apia" });
  await page
    .getByLabel("Tarea 3: Proyecto", { exact: true })
    .selectOption({ label: "Centro de decisiones" });
  const widths = await page.evaluate(() =>
    ["tasks", "blocks"].map(
      (grid) =>
        document
          .querySelector(`[data-table="${grid}"] th:nth-child(2)`)
          .getBoundingClientRect().width,
    ),
  );
  expect(widths[0]).toBeCloseTo(widths[1], 0);
  await page.getByLabel("Tarea 2: Descripción", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(project2).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("Tarea 3: Prioridad", { exact: true }),
  ).toBeFocused();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await expect(project2.locator("option:checked")).toHaveText("Apia");
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  for (const name of [
    "Avanzar con la matriz de casos",
    "Preparar modelo de dominio para casos de ejemplo",
  ]) {
    const row = page
      .locator("[data-focus-id]")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await row.locator(".focus-remaining summary").click();
    await row
      .getByRole("button", { name: "Terminar tarea", exact: true })
      .click();
  }
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.getByRole("button", { name: "Historia", exact: true }).click();
  await expect(page.locator("#history-actual")).toHaveText("0:30 hs");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.locator("#history-project-toggle").click();
  await expect(page.locator("#history-project-popover")).toBeVisible();
  const apia = page.getByRole("checkbox", { name: "Apia", exact: true });
  await apia.check();
  await expect(apia).toBeFocused();
  await expect(page.locator("[data-history-task]:visible")).toHaveCount(1);
  await expect(page.locator("#history-actual")).toHaveText("0:30 hs");
  await page
    .getByRole("checkbox", { name: "Centro de decisiones", exact: true })
    .check();
  await expect(page.locator("[data-history-task]:visible")).toHaveCount(2);
  await expect(page.locator("#history-actual")).toHaveText("0:30 hs");
  await page
    .getByRole("checkbox", { name: "Integración Apia CDD", exact: true })
    .check();
  await expect(page.locator("#history-project-selection")).toHaveText(
    "3 proyectos",
  );
  const boxes = await page
    .locator("#history-project-popover input")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().width));
  expect(boxes.every((width) => width <= 16)).toBe(true);
  await page.getByRole("button", { name: "Activar tema oscuro" }).click();
  await page.locator("#history-project-toggle").click();
  await page.screenshot({
    path: testInfo.outputPath("project-popup.png"),
    fullPage: true,
  });
  await page.locator("#history-project-all").click();
  await page
    .getByRole("checkbox", { name: "Sin proyecto", exact: true })
    .check();
  await expect(page.locator("#history-actual")).toHaveText("0:00 hs");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Todo el historial", exact: true })
    .click();
  await expect(page.locator("#history-actual")).toHaveText("0:30 hs");
});

test("posponer una tarea a otra jornada conserva el proyecto", async ({
  page,
}) => {
  const plan = example();
  plan.tasks[1].projectId = "a";
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await page.addInitScript((plan) => {
    if (!localStorage.getItem("jornada.v1"))
      localStorage.setItem(
        "jornada.v1",
        JSON.stringify({
          version: 2,
          projects: [{ id: "a", name: "Apia" }],
          tasks: [],
          days: { "2026-10-15": { plan, actual: null } },
        }),
      );
  }, plan);
  await page.goto("/#/foco");
  const row = page.locator("[data-focus-id]").filter({
    has: page.getByRole("heading", {
      name: "Avanzar con la matriz de casos",
      exact: true,
    }),
  });
  await row.locator(".focus-remaining summary").click();
  await row
    .getByRole("button", { name: "Posponer tarea", exact: true })
    .click();
  await page.getByLabel("Día", { exact: true }).fill("2026-10-16");
  await page.getByLabel("Hora", { exact: true }).fill("09:00");
  await page.getByRole("button", { name: "Posponer", exact: true }).click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.goto("/#/jornada");
  await page.getByLabel("Fecha de jornada").fill("2026-10-16");
  await expect(
    page
      .getByLabel("Tarea 1: Proyecto", { exact: true })
      .locator("option:checked"),
  ).toHaveText("Apia");
});
