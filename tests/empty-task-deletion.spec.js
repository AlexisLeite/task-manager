import { test, expect } from "@playwright/test";
import { task, block, document as empty } from "../src/model.js";

for (const view of ["jornada", "backlog"]) {
  test(`${view}: elimina filas vacías directamente y confirma contenido y selecciones mixtas`, async ({
    page,
  }) => {
    const plan = empty();
    const tasks = ["", "Con descripción", ""].map((name, i) => ({
      ...task([]),
      code: `t${i + 1}`,
      name,
    }));
    plan.tasks = tasks;
    if (view === "jornada")
      plan.blocks.push({
        ...block(),
        taskIds: [tasks[2].id],
        start: "10:00",
        end: "",
      });
    await page.addInitScript(
      ({ plan, tasks }) => {
        if (!localStorage.getItem("jornada.v1"))
          localStorage.setItem(
            "jornada.v1",
            JSON.stringify({
              version: 2,
              tasks: [],
              projects: [],
              backlog: tasks,
              days: { "2026-10-26": { plan, actual: null } },
            }),
          );
        localStorage.setItem("jornada.selectedDate", "2026-10-26");
      },
      { plan, tasks },
    );
    await page.goto(`/#/${view}`);
    const rows = page.locator(
      view === "jornada" ? ".day-grid tbody tr" : "#backlog-list tr",
    );
    const dialog = page.getByRole("dialog", { name: "Eliminar tarea" });
    const trash = (row) => row.locator(".delete-task");
    const emptyRow =
      view === "jornada"
        ? rows.filter({
            has: page.getByLabel("Tarea 2: Identificador", { exact: true }),
          })
        : rows.first();
    // Locate the unscheduled blank t1; Jornada puts scheduled t3 first.
    await trash(emptyRow).click();
    await expect(rows).toHaveCount(2);
    await expect(dialog).toHaveCount(0);
    const named = rows.filter({
      has: page.locator('input[value="Con descripción"]'),
    });
    await trash(named).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    if (view === "jornada") {
      await trash(rows.first()).click();
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
      const input = rows.last().locator('input[data-col="0"]');
      await input.press("Shift+Space");
      await page.keyboard.press("Delete");
      await expect(rows).toHaveCount(2);
      await expect(dialog).not.toBeVisible();
    } else {
      await rows.last().getByLabel("Descripción de tarea").focus();
      await page.keyboard.press("Shift+Space");
      await page.keyboard.press("Shift+ArrowUp");
      await page.keyboard.press("Delete");
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await trash(rows.last()).click();
      await expect(rows).toHaveCount(1);
      await expect(dialog).not.toBeVisible();
    }
  });
}
