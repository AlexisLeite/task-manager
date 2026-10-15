import { test, expect } from "@playwright/test";
import { document as newDocument, task, block, example } from "../src/model.js";

function performed(minutes, name = "Matriz", identity = "global-matrix") {
  const doc = newDocument();
  const definition = { ...task([]), taskId: identity, name, estimate: "03:00" };
  doc.tasks.push(definition);
  doc.blocks.push({
    ...block(),
    taskIds: [definition.id],
    start: "09:00",
    end: `${String(9 + minutes / 60).padStart(2, "0")}:00`,
  });
  return doc;
}

test("Historia filtra resumen y gráficas y navega a las jornadas realizadas", async ({
  page,
}, testInfo) => {
  const first = performed(60),
    second = performed(120),
    third = performed(180);
  const data = {
    version: 2,
    tasks: [{ id: "global-matrix", name: "Matriz" }],
    days: {
      "2026-09-30": { plan: newDocument(), actual: first },
      "2026-10-01": { plan: newDocument(), actual: second },
      "2026-10-02": { plan: performed(180, "Descanso"), actual: third },
    },
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("jornada.v1"))
      localStorage.setItem("jornada.v1", JSON.stringify(data));
  }, data);
  await page.goto("/#/historia");
  await expect(page.locator("#history-actual")).toHaveText("6:00 hs");
  await expect(page.locator("[data-history-task] td").first()).toHaveText(
    "Descanso",
  );
  const charts = await page.locator(".history-chart").evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, left: r.left, height: r.height };
    }),
  );
  expect(charts[0].top).toBe(charts[1].top);
  expect(charts[1].left).toBeGreaterThan(charts[0].left);
  expect(charts[0].height).toBeLessThan(230);
  await expect(
    page.locator("#history-daily-chart [data-history-day]"),
  ).toHaveCount(3);
  await expect(
    page.locator("#history-task-chart [data-history-task-bar]"),
  ).toHaveCount(1);
  await page.getByLabel("Desde", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Hasta", { exact: true }).fill("2026-10-01");
  await expect(page.locator("#history-actual")).toHaveText("2:00 hs");
  await expect(page.locator("[data-history-day]")).toHaveAttribute(
    "data-minutes",
    "120",
  );
  await expect(page.locator("[data-history-task-bar]")).toHaveAttribute(
    "data-minutes",
    "120",
  );
  await page
    .getByRole("button", { name: "Todo el historial", exact: true })
    .click();
  await expect(page.locator("[data-history-day]")).toHaveCount(3);
  await page.getByRole("button", { name: "Activar tema oscuro" }).click();
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(25, 27, 30)",
  );
  await page.screenshot({
    path: testInfo.outputPath("historia-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("historia-mobile.png"),
    fullPage: true,
  });
  const widths = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  await page.locator('[data-date="2026-10-01"]').click();
  await expect(page.locator("#actual")).toHaveClass("active");
  await expect(page.getByLabel("Fecha de jornada")).toHaveValue("2026-10-01");
});

test("Posponer marca solo los campos Día y Hora y cierra con fondo o Escape", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-10-15T09:30:00") });
  const data = {
    version: 2,
    tasks: [],
    days: { "2026-10-15": { plan: performed(180), actual: null } },
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("jornada.v1"))
      localStorage.setItem("jornada.v1", JSON.stringify(data));
  }, data);
  await page.goto("/#/foco");
  const open = async () => {
    await page.locator("[data-focus-id] .focus-remaining summary").click();
    await page
      .getByRole("button", { name: "Posponer tarea", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toBeVisible();
  };
  await open();
  for (const field of ["Día", "Hora"]) {
    await page.getByLabel(field, { exact: true }).focus();
    await expect(
      page.getByLabel(field, { exact: true }).locator(".."),
    ).toHaveCSS("outline-style", "none");
    await expect(page.getByLabel(field, { exact: true })).toHaveCSS(
      "outline-offset",
      "-1px",
    );
  }
  await page.screenshot({
    path: testInfo.outputPath("posponer-focus.png"),
    fullPage: true,
  });
  await page.mouse.click(2, 2);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.clock.runFor(250);
  await open();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("una tarea vencida permanece y permite completar o reprogramar conservando las horas", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T11:59:59") });
  const data = {
    version: 2,
    tasks: [],
    days: { "2026-10-15": { plan: performed(180), actual: null } },
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("jornada.v1"))
      localStorage.setItem("jornada.v1", JSON.stringify(data));
  }, data);
  await page.goto("/#/foco");
  await page.clock.runFor(1400);
  const row = page.locator("[data-focus-id]");
  await expect(row).toHaveCount(1);
  await expect(row.locator("time")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Completa", exact: true }),
  ).toBeVisible();
  await row.getByRole("heading").click({ button: "right" });
  await expect(row.locator(".focus-remaining .focus-menu")).toHaveAttribute(
    "open",
    "",
  );
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Reprogramar", exact: true }).click();
  await page.getByLabel("Día", { exact: true }).fill("2026-10-15");
  await page.getByLabel("Hora", { exact: true }).fill("14:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reprogramar", exact: true })
    .click();
  await expect(page.locator("[data-focus-id]")).toHaveCount(0);
  await expect(page.locator(".focus-upcoming[data-entry-key]")).toHaveCount(1);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("jornada.v1")),
  );
  expect(
    saved.days["2026-10-15"].actual.blocks.map((b) => [b.start, b.end]),
  ).toEqual([["09:00", "12:00"]]);
  await page.clock.fastForward(5 * 3600000);
  await expect(page.locator("[data-focus-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Completa", exact: true }).click();
  await expect(page.locator("[data-focus-id]")).toHaveCount(0);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await expect(page.locator("[data-focus-id]")).toHaveCount(0);
  const completed = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("jornada.v1")).days["2026-10-15"].actual,
  );
  expect(completed.blocks.map((b) => [b.start, b.end])).toEqual([
    ["09:00", "12:00"],
    ["14:00", "17:00"],
  ]);
});

test("Historia mantiene cinco tareas sin scroll vertical y usa todo el ancho de la gráfica", async ({
  page,
}, testInfo) => {
  const plan = example();
  await page.addInitScript(
    (data) => {
      localStorage.setItem("jornada.v1", JSON.stringify(data));
      localStorage.setItem("jornada.theme", "dark");
    },
    { version: 2, tasks: [], days: { "2026-10-15": { plan, actual: plan } } },
  );
  await page.goto("/#/historia");
  await expect(
    page.getByRole("heading", { name: "Historia", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".history-task-bar")).toHaveCount(5);
  const layout = await page
    .locator("#history-task-chart")
    .evaluate((el) => ({
      height: el.clientHeight,
      scrollHeight: el.scrollHeight,
      width: el.clientWidth,
      rowWidth: el.querySelector(".history-task-bar").getBoundingClientRect()
        .width,
    }));
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height);
  expect(layout.rowWidth).toBeGreaterThan(layout.width * 0.95);
  await page.screenshot({
    path: testInfo.outputPath("historia-five-tasks.png"),
    fullPage: true,
  });
});
