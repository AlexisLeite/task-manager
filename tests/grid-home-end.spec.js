import { test, expect } from "@playwright/test";
import { task, document as empty } from "../src/model.js";

for (const view of ["jornada", "backlog"]) {
  test(`Inicio y Fin editan la celda; Ctrl mueve a los extremos de ${view}`, async ({
    page,
  }) => {
    const tasks = ["Primera tarea", "Descripción de la segunda tarea"].map(
      (name, i) => ({
        ...task([]),
        code: `t${i + 1}`,
        name,
        estimate: "01:00",
      }),
    );
    const plan = empty();
    plan.tasks = tasks;
    await page.addInitScript(
      (data) => localStorage.setItem("jornada.v1", JSON.stringify(data)),
      {
        version: 2,
        tasks: [],
        projects: [],
        backlog: tasks,
        days: { "2026-10-26": { plan, actual: null } },
      },
    );
    await page.addInitScript(() =>
      localStorage.setItem("jornada.selectedDate", "2026-10-26"),
    );
    await page.goto(`/#/${view}`);
    const input =
      view === "jornada"
        ? page.getByLabel("Tarea 2: Descripción", { exact: true })
        : page.getByLabel("Descripción de tarea", { exact: true }).nth(1);
    await input.focus();
    await input.evaluate((el) => el.setSelectionRange(8, 8));
    await input.press("Home");
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((el) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([0, 0]);
    await input.press("Shift+End");
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((el) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([0, tasks[1].name.length]);
    await input.press("End");
    expect(
      await input.evaluate((el) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([tasks[1].name.length, tasks[1].name.length]);
    const duration =
      view === "jornada"
        ? page.getByLabel("Tarea 2: Duración", { exact: true })
        : page.getByLabel("Duración de tarea", { exact: true }).nth(1);
    await duration.focus();
    await duration.press("Home");
    await expect(duration).toBeFocused();
    expect(await duration.evaluate((el) => el.selectionStart)).toBe(0);
    await duration.press("End");
    expect(await duration.evaluate((el) => el.selectionStart)).toBe(5);
    await duration.press("Control+Home");
    const first =
      view === "jornada"
        ? page.getByRole("combobox", {
            name: "Tarea 1: Prioridad",
            exact: true,
          })
        : page.getByLabel("Descripción de tarea").first();
    await expect(first).toBeFocused();
    await first.press("Control+End");
    if (view === "jornada")
      await expect(
        page.getByRole("combobox", { name: "Tarea 2: Proyecto", exact: true }),
      ).toBeFocused();
    else await expect(duration).toBeFocused();
  });
}
