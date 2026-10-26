import { test, expect } from "@playwright/test";
import { task, block, document as empty, minutes, time } from "../src/model.js";

for (const [theme, reducedMotion] of [
  ["light", "no-preference"],
  ["dark", "reduce"],
]) {
  test(`Jornada señala discontinuidades y actualiza el borde al editar (${theme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const plan = empty();
    for (const [start, end] of [
      ["10:00", "11:00"],
      ["11:00", "12:00"],
      ["13:00", "14:00"],
      ["13:30", "15:00"],
      ["", ""],
    ]) {
      const t = {
        ...task(plan.tasks),
        name: "Tarea de prueba",
        estimate: start ? time(minutes(end) - minutes(start)) : "",
      };
      plan.tasks.push(t);
      if (start) plan.blocks.push({ ...block(), taskIds: [t.id], start, end });
    }
    await page.addInitScript(
      ({ plan, theme }) => {
        localStorage.setItem(
          "jornada.v1",
          JSON.stringify({
            version: 2,
            tasks: [],
            projects: [],
            days: { "2026-10-26": { plan, actual: null } },
          }),
        );
        localStorage.setItem("jornada.selectedDate", "2026-10-26");
        localStorage.setItem("jornada.theme", theme);
      },
      { plan, theme },
    );
    await page.goto("/#/jornada");
    const rows = page.locator(".day-grid tbody tr");
    await expect(rows).toHaveCount(5);
    const toggle = page.getByRole("button", {
      name: "Verificar integridad",
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".time-break-before")).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveCSS("color", "rgb(50, 168, 82)");
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    for (const i of [0, 1, 3, 4])
      await expect(rows.nth(i)).not.toHaveClass(/time-break-before/);
    for (const i of [2]) {
      await expect(rows.nth(i)).toHaveClass(/time-break-before/);
      await expect(rows.nth(i).locator("td").first()).toHaveCSS(
        "border-top-width",
        "2px",
      );
    }
    const input = page.getByLabel("Tarea 3: Hora inicio", { exact: true });
    for (const [start, marked] of [
      ["12:11", true],
      ["12:10", false],
      ["12:09", false],
      ["11:50", false],
      ["11:49", false],
    ]) {
      await input.fill(start);
      await input.press("Tab");
      if (marked) await expect(rows.nth(2)).toHaveClass(/time-break-before/);
      else await expect(rows.nth(2)).not.toHaveClass(/time-break-before/);
    }
    await input.fill("12:00");
    await input.press("Tab");
    await expect(rows.nth(2)).not.toHaveClass(/time-break-before/);
    await expect(rows.nth(2).locator("td").first()).toHaveCSS(
      "border-top-width",
      "1px",
    );
    await expect(
      page.getByLabel("Tarea 3: Hora fin", { exact: true }),
    ).toBeFocused();
    await expect(page.locator("#saved")).toHaveText("Guardado");
    await toggle.click();
    await expect(page.locator(".time-break-before")).toHaveCount(0);
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".time-break-before")).toHaveCount(0);
  });
}

for (const [name, intervals, expected] of [
  [
    "mismo fin",
    [
      ["10:00", "14:39"],
      ["12:09", "14:39"],
    ],
    [],
  ],
  [
    "tarea contenida",
    [
      ["15:45", "19:23"],
      ["18:15", "19:05"],
    ],
    [],
  ],
  [
    "cobertura de varias filas",
    [
      ["10:00", "15:00"],
      ["11:00", "12:00"],
      ["13:00", "14:00"],
      ["15:10", "16:00"],
      ["16:11", "17:00"],
    ],
    [4],
  ],
]) {
  test(`no marca solapamientos: ${name}`, async ({ page }) => {
    const plan = empty();
    for (const [start, end] of intervals) {
      const t = {
        ...task(plan.tasks),
        name: "Tarea",
        estimate: time(minutes(end) - minutes(start)),
      };
      plan.tasks.push(t);
      plan.blocks.push({ ...block(), taskIds: [t.id], start, end });
    }
    await page.addInitScript((plan) => {
      localStorage.setItem(
        "jornada.v1",
        JSON.stringify({
          version: 2,
          tasks: [],
          projects: [],
          days: { "2026-10-26": { plan, actual: null } },
        }),
      );
      localStorage.setItem("jornada.selectedDate", "2026-10-26");
      localStorage.setItem("jornada.verifyIntegrity", "true");
    }, plan);
    await page.goto("/#/jornada");
    await expect(page.locator(".day-grid tbody tr")).toHaveCount(
      intervals.length,
    );
    await expect
      .poll(() =>
        page
          .locator(".time-break-before")
          .evaluateAll((rows) => rows.map((row) => Number(row.dataset.index))),
      )
      .toEqual(expected);
  });
}
