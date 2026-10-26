import { test, expect } from "@playwright/test";
import { example } from "../src/model.js";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
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
  await page.goto("/#/foco");
});
const row = (page, name) =>
  page
    .locator(".focus-card[data-entry-key]")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
async function action(page, name, label) {
  const card = row(page, name);
  await card.locator(".focus-remaining summary").click();
  await card.getByRole("button", { name: label, exact: true }).click();
}

test("enviar una tarea paralela al backlog termina y registra solo su tramo", async ({
  page,
}) => {
  const name = "Avanzar con la matriz de casos";
  await action(page, name, "Enviar al backlog");
  await expect(row(page, name)).toHaveCount(0);
  await expect(
    row(page, "Preparar modelo de dominio para casos de ejemplo"),
  ).toBeVisible();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("jornada.v1")),
  );
  const day = saved.days["2026-10-15"];
  expect(saved.backlog).toHaveLength(1);
  expect(saved.backlog[0]).toMatchObject({ name, estimate: "02:30" });
  const original = day.plan.tasks.find((t) => t.name === name);
  expect(
    day.plan.blocks.find((b) => b.taskIds.includes(original.id)),
  ).toMatchObject({
    start: "16:30",
    end: "17:00",
    focusStates: { [original.id]: "finished" },
  });
  expect(day.actual.blocks[0]).toMatchObject({ start: "16:30", end: "17:00" });
  await page.reload();
  await expect(row(page, name)).toHaveCount(0);
});

test("enviar una próxima tarea al backlog conserva su duración sin inventar horas", async ({
  page,
}) => {
  await action(page, "Descanso", "Enviar al backlog");
  await expect(row(page, "Descanso")).toHaveCount(0);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("jornada.v1")),
  );
  expect(saved.backlog[0]).toMatchObject({
    name: "Descanso",
    estimate: "00:30",
  });
  expect(saved.days["2026-10-15"].actual).toBeNull();
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await page
    .getByRole("button", { name: "Iniciar Descanso", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/jornada$/);
});

test("hover de opciones y prioridad; prioridad editable desde Plan y primera columna", async ({
  page,
}) => {
  const next = row(page, "Descanso");
  const summary = next.locator(".focus-remaining summary");
  await page.locator("#nav-focus").hover();
  await expect(summary).toHaveCSS("opacity", "0");
  await expect(next.locator(".upcoming-priority")).toHaveCSS("opacity", "0.6");
  await next.hover();
  await expect(summary).toHaveCSS("opacity", "1");
  await expect(next.locator(".upcoming-priority")).toHaveCSS("opacity", "1");
  await action(
    page,
    "Preparar modelo de dominio para casos de ejemplo",
    "Ver definición",
  );
  await expect(
    page.getByLabel("Tarea 3: Descripción", { exact: true }),
  ).toBeFocused();
  await expect(page.locator('[data-table="tasks"] thead th').nth(1)).toHaveText(
    "Estado",
  );
  const priority = page.getByLabel("Tarea 3: Prioridad", { exact: true });
  await priority.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByLabel("Tarea 3: Identificador", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(priority).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByLabel("Tarea 4: Prioridad", { exact: true }),
  ).toBeFocused();
  const menu = page
    .locator('[data-table="tasks"] .plan-priority')
    .filter({ has: page.getByRole("img", { name: "t3: Alta", exact: true }) });
  await menu.locator("summary").click();
  await menu.getByRole("button", { name: "Baja", exact: true }).click();
  await expect(
    page.getByLabel("Tarea 3: Prioridad", { exact: true }),
  ).toHaveAttribute("data-priority-value", "Baja");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await expect(
    page.getByLabel("Tarea 3: Prioridad", { exact: true }),
  ).toHaveAttribute("data-priority-value", "Baja");
  await page
    .getByRole("button", { name: "Día siguiente", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-navigation",
    "forward",
  );
  await page.getByRole("button", { name: "Día anterior", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-navigation", "back");
});
