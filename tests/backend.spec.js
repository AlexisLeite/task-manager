import { test, expect } from "@playwright/test";
import { example } from "../src/model.js";

test("las tareas comparten barra solo si coinciden inicio y fin, incluso en bloques distintos", async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await page.goto("/#/foco");
  await expect(page.locator("[data-focus-id]")).toHaveCount(2);
  await expect(page.getByRole("progressbar")).toHaveCount(1);
  await expect(page.locator("[data-focus-id] time")).toHaveCount(1);
  const change = async (start) => {
    const response = await request.get("/api/workspace");
    const data = await response.json();
    data.days["2026-10-15"].plan.blocks[0].start = start;
    // The first task lasts two hours; normalization derives its end.
    data.days["2026-10-15"].plan.tasks[0].estimate =
      start === "16:30" ? "02:30" : "03:00";
    data.days["2026-10-15"].plan.blocks[0].end = "19:00";
    await request.put("/api/workspace", {
      headers: { "If-Match": response.headers().etag },
      data,
    });
    await page.clock.runFor(1100);
  };
  await change("16:30");
  await expect(page.locator("[data-focus-id]")).toHaveCount(3);
  await expect(page.getByRole("progressbar")).toHaveCount(1);
  await change("16:00");
  await expect(page.getByRole("progressbar")).toHaveCount(2);
  await expect(page.locator("[data-focus-id] time")).toHaveCount(2);
  await change("16:30");
  await expect(page.getByRole("progressbar")).toHaveCount(1);
});

test.beforeEach(async ({ request }) => {
  const current = await request.get("/api/workspace");
  const result = await request.put("/api/workspace", {
    headers: { "If-Match": current.headers().etag },
    data: {
      version: 2,
      days: { "2026-10-15": { plan: example(), actual: null } },
      tasks: [],
    },
  });
  expect(result.ok()).toBeTruthy();
});
test("SQLite se comparte entre navegadores, persiste cambios y reconcilia desde Foco", async ({
  page,
  browser,
  request,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await page.goto("/#/jornada");
  await page.getByLabel("Fecha de jornada").fill("2026-10-15");
  const field = page.getByLabel("Tarea 2: Descripción", { exact: true });
  await field.fill("Persistido en SQLite");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  expect(
    await page.evaluate(() => localStorage.getItem("jornada.v1")),
  ).toBeNull();
  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto("http://127.0.0.1:4174/#/jornada");
  await other.getByLabel("Fecha de jornada").fill("2026-10-15");
  await expect(
    other.getByLabel("Tarea 2: Descripción", { exact: true }),
  ).toHaveValue("Persistido en SQLite");
  await second.close();
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  const row = page.locator("[data-focus-id]").filter({
    has: page.getByRole("heading", {
      name: "Persistido en SQLite",
      exact: true,
    }),
  });
  await row.locator(".focus-remaining summary").click();
  await row
    .getByRole("button", { name: "Terminar tarea", exact: true })
    .click();
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const saved = await (await request.get("/api/workspace")).json();
  expect(saved.days["2026-10-15"].actual.blocks[0].end).toBe("17:00");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Persistido en SQLite", exact: true }),
  ).toHaveCount(0);
});
test("un conflicto no sobrescribe SQLite y no hace fallback a localStorage", async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await page.goto("/#/jornada");
  await page.getByLabel("Fecha de jornada").fill("2026-10-15");
  const response = await request.get("/api/workspace"),
    data = await response.json();
  data.days["2026-10-15"].plan.tasks[0].name = "Cambio de otro navegador";
  await request.put("/api/workspace", {
    headers: { "If-Match": response.headers().etag },
    data,
  });
  await page
    .getByLabel("Tarea 1: Descripción", { exact: true })
    .fill("Cambio local");
  await expect(page.locator("#notice")).toContainText("otra pestaña");
  expect(
    (await (await request.get("/api/workspace")).json()).days["2026-10-15"].plan
      .tasks[0].name,
  ).toBe("Cambio de otro navegador");
  expect(
    await page.evaluate(() => localStorage.getItem("jornada.v1")),
  ).toBeNull();
});

test("el poll actualiza un cliente abierto y difiere cambios mientras se edita", async ({
  page,
  browser,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await page.goto("/#/foco");
  await page.evaluate(() => {
    window.originalFocusList = document.querySelector(".focus-list");
    window.originalFocusRow = document.querySelector("[data-focus-id]");
  });
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.goto("http://127.0.0.1:4174/#/jornada");
    await other.getByLabel("Fecha de jornada").fill("2026-10-15");
    await other
      .getByLabel("Tarea 2: Descripción", { exact: true })
      .fill("Cambio compartido por poll");
    await expect(other.locator("#saved")).toHaveText("Guardado");
    await page.clock.runFor(1100);
    await expect(page.locator("[data-focus-id] h2")).toContainText([
      "Cambio compartido por poll",
    ]);
    await expect(page.locator("#notice")).toBeEmpty();
    expect(
      await page.evaluate(
        () =>
          window.originalFocusList === document.querySelector(".focus-list") &&
          window.originalFocusRow === document.querySelector("[data-focus-id]"),
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Jornada", exact: true }).click();
    const input = page.getByLabel("Tarea 2: Descripción", { exact: true });
    await input.focus();
    await other
      .getByLabel("Tarea 2: Descripción", { exact: true })
      .fill("Segundo cambio compartido");
    await expect(other.locator("#saved")).toHaveText("Guardado");
    await page.clock.runFor(1100);
    await expect(input).toHaveValue("Cambio compartido por poll");
    await expect(input).toBeFocused();
    await page.getByRole("button", { name: "Jornada", exact: true }).focus();
    await page.clock.runFor(1100);
    await expect(input).toHaveValue("Segundo cambio compartido");
  } finally {
    await context.close();
  }
});

test("el poll anima el reordenamiento remoto con AutoAnimate", async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await page.goto("/#/foco");
  await page.clock.runFor(500);
  const names = await page.locator("[data-focus-id] h2").allTextContents();
  const ids = await page
    .locator("[data-focus-id]")
    .evaluateAll((rows) => rows.map((row) => row.dataset.focusId));
  await page.evaluate(() => {
    window.remoteAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.matches(".focus-card")) window.remoteAnimations.push(frames);
      return animate.call(this, frames, options);
    };
  });
  const response = await request.get("/api/workspace");
  const data = await response.json();
  data.days["2026-10-15"].plan.focusOrder = ids.reverse();
  await request.put("/api/workspace", {
    headers: { "If-Match": response.headers().etag },
    data,
  });
  await page.clock.runFor(1100);
  await expect(page.locator("[data-focus-id] h2")).toHaveText(names.reverse());
  expect(
    await page.evaluate(() =>
      window.remoteAnimations.some((frames) =>
        frames.some((frame) => frame.transform?.includes("translate")),
      ),
    ),
  ).toBe(true);
});
