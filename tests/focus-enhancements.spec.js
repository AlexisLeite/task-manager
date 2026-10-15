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

test("posponer una tarea paralela conserva duración, otras tareas y persistencia", async ({
  page,
}) => {
  const name = "Avanzar con la matriz de casos";
  await action(page, name, "Posponer tarea");
  const dialog = page.getByRole("dialog", { name: "Posponer tarea" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Día", { exact: true }).fill("2026-10-15");
  await dialog.getByLabel("Hora", { exact: true }).fill("16:00");
  await dialog.getByRole("button", { name: "Posponer", exact: true }).click();
  await expect(dialog.getByRole("alert")).not.toBeEmpty();
  await dialog.getByLabel("Día", { exact: true }).fill("2026-10-16");
  await dialog.getByLabel("Hora", { exact: true }).fill("23:00");
  await dialog.getByRole("button", { name: "Posponer", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("dentro del día");
  await dialog.getByLabel("Hora", { exact: true }).fill("09:00");
  await dialog.getByRole("button", { name: "Posponer", exact: true }).click();
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect(
    page.locator("[data-focus-id]:not(:has(.focus-expired-actions)) h2"),
  ).toHaveText(["Preparar modelo de dominio para casos de ejemplo"]);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("jornada.v1")),
  );
  expect(saved.days["2026-10-16"].plan.tasks[0].name).toBe(name);
  expect(saved.days["2026-10-16"].plan.blocks[0]).toMatchObject({
    start: "09:00",
    end: "11:30",
  });
  expect(saved.days["2026-10-15"].actual).toBeNull();
  await page.reload();
  await expect(
    page.locator("[data-focus-id]:not(:has(.focus-expired-actions)) h2"),
  ).toHaveText(["Preparar modelo de dominio para casos de ejemplo"]);
});

test("próximas tareas: cancelar el modal, posponer y ver definición", async ({
  page,
}) => {
  await action(page, "Descanso", "Posponer tarea");
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(row(page, "Descanso")).toBeVisible();
  await page.clock.runFor(300);
  await action(page, "Descanso", "Posponer tarea");
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hora", { exact: true }).fill("20:00");
  await dialog.getByRole("button", { name: "Posponer", exact: true }).click();
  await expect(row(page, "Descanso").locator("time")).toHaveText(
    "20:00 - 20:30",
  );
  await action(page, "Descanso", "Ver definición");
  await expect(page).toHaveURL(/#\/jornada$/);
  await expect(
    page.getByLabel("Tarea 5: Descripción", { exact: true }),
  ).toBeFocused();
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
    "Prioridad",
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
    .locator('[data-table="blocks"] .plan-priority')
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
