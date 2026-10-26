import { test, expect } from "@playwright/test";
import { task, document as empty } from "../src/model.js";

for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`Ctrl+clic alterna filas y Suma también sigue la selección con Shift (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const plan = empty();
    for (const estimate of ["01:00", "", "00:30", "00:45"])
      plan.tasks.push({
        ...task(plan.tasks),
        name: `Tarea ${plan.tasks.length + 1}`,
        estimate,
      });
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
    }, plan);
    await page.goto("/#/jornada");
    const selected = page.locator('.day-grid tr[aria-selected="true"]');
    const sum = page.locator("#selection-total");
    const name = (i) =>
      page.getByLabel(`Tarea ${i}: Descripción`, { exact: true });
    const handle = (i) =>
      page.getByRole("button", { name: `Seleccionar tarea ${i}`, exact: true });
    await expect(sum).toHaveAttribute("aria-hidden", "true");
    await name(1).click({ modifiers: ["Control"] });
    await name(3).click({ modifiers: ["Control"] });
    await expect(selected).toHaveCount(2);
    await expect(sum).toHaveText("Suma: 1:30 hs");
    await expect(sum).toHaveCSS("opacity", "1");
    await page
      .getByRole("button", { name: "Eliminar t3", exact: true })
      .click({ modifiers: ["Control"] });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(selected).toHaveCount(1);
    await expect(sum).toHaveText("Suma: 1:00 hs");
    await name(2).click({ modifiers: ["Control"] });
    await expect(sum).toHaveText("Suma: 1:00 hs");
    await name(4).click({ modifiers: ["Shift"] });
    await expect(selected).toHaveCount(3);
    await expect(sum).toHaveText("Suma: 1:15 hs");
    await page.keyboard.press("Escape");
    await expect(sum).toHaveAttribute("aria-hidden", "true");
    await name(1).focus();
    await page.keyboard.press("Shift+Space");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(selected).toHaveCount(3);
    await expect(sum).toHaveText("Suma: 1:30 hs");
    await handle(4).click({ modifiers: ["Control"] });
    await expect(selected).toHaveCount(4);
    await expect(sum).toHaveText("Suma: 2:15 hs");
    await expect(page.locator("#total")).toHaveText("Trabajado: 0:00 hs");
    const footer = await page
      .locator(".document-footer")
      .evaluate((el) =>
        [...el.children]
          .slice(0, 2)
          .map((child) => child.getBoundingClientRect().top),
      );
    expect(footer[0]).toBe(footer[1]);
    await handle(2).click();
    await expect(selected).toHaveCount(1);
    await expect(sum).toHaveText("Suma: 0:00 hs");
  });
}
