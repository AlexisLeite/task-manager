import { test, expect } from "@playwright/test";
import { task, document as empty } from "../src/model.js";

for (const view of ["jornada", "backlog"])
  for (const reducedMotion of ["reduce", "no-preference"]) {
    test(`${view}: nueva fila enfoca descripción y Escape cancela sin afectar otras tareas (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      const original = {
        ...task([]),
        name: "Conservar tarea",
        estimate: "01:00",
      };
      const plan = empty();
      plan.tasks = [original];
      await page.addInitScript(
        ({ plan, original }) => {
          if (!localStorage.getItem("jornada.v1"))
            localStorage.setItem(
              "jornada.v1",
              JSON.stringify({
                version: 2,
                tasks: [],
                projects: [],
                backlog: [original],
                days: { "2026-10-26": { plan, actual: null } },
              }),
            );
          localStorage.setItem("jornada.selectedDate", "2026-10-26");
        },
        { plan, original },
      );
      await page.goto(`/#/${view}`);
      const rows = page.locator(
        view === "jornada" ? ".day-grid tbody tr" : "#backlog-list tr",
      );
      const description = (i) =>
        view === "jornada"
          ? page.getByLabel(`Tarea ${i + 1}: Descripción`, { exact: true })
          : rows.nth(i).getByLabel("Descripción de tarea", { exact: true });
      const source =
        view === "jornada"
          ? page.getByLabel("Tarea 1: Identificador", { exact: true })
          : description(0);
      await source.focus();
      await source.press("Enter");
      await expect(rows).toHaveCount(2);
      await expect(description(1)).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(rows).toHaveCount(1);
      await expect(source).toBeFocused();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
      await expect(description(1)).toBeFocused();
      await description(1).fill("Borrador para cancelar");
      await page.keyboard.press("Escape");
      await expect(rows).toHaveCount(1);
      await expect(description(0)).toHaveValue(original.name);
      await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
      await description(1).fill("Tarea que conservo");
      await description(0).click();
      await description(1).focus();
      await page.keyboard.press("Escape");
      await expect(rows).toHaveCount(2);
      await expect(description(1)).toHaveValue("Tarea que conservo");
      await expect(page.locator("#saved")).toHaveText("Guardado");
      await page.reload();
      await expect(rows).toHaveCount(2);
      await expect(description(0)).toHaveValue(original.name);
      await expect(description(1)).toHaveValue("Tarea que conservo");
    });
  }
