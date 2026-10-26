import { test, expect } from "@playwright/test";
import { task } from "../src/model.js";

for (const reducedMotion of ["no-preference", "reduce"]) {
  test(`eliminar mantiene las columnas y el foco (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const backlog = [
      "Primera tarea",
      "Eliminar esta tarea",
      "Última tarea",
    ].map((name) => ({ ...task([]), name }));
    await page.addInitScript(
      (data) => localStorage.setItem("jornada.v1", JSON.stringify(data)),
      {
        version: 2,
        tasks: [],
        projects: [],
        days: {},
        backlog,
      },
    );
    await page.goto("/#/backlog");
    await page
      .getByRole("button", {
        name: "Eliminar Eliminar esta tarea",
        exact: true,
      })
      .click();
    await page.evaluate(() => {
      const row = document.querySelectorAll("#backlog-list tr")[1];
      window.removedRow = row;
      window.beforeCells = [...row.cells].map((cell) => {
        const { x, width } = cell.getBoundingClientRect();
        return { x, width };
      });
      window.survivingInput = document.querySelectorAll(
        '[data-backlog-field="name"]',
      )[2];
      window.rowAnimations = [];
      const play = Animation.prototype.play;
      Animation.prototype.play = function (...args) {
        if (this.effect?.target === row && row.style.position === "absolute") {
          window.removalCells = [...row.cells].map((cell) => {
            const { x, width } = cell.getBoundingClientRect();
            return { x, width };
          });
          window.removalFrames = this.effect.getKeyframes();
        }
        const result = play.apply(this, args);
        if (
          this.effect?.target?.matches?.(
            "#backlog-list tr, .backlog-view .grid-scroll",
          )
        ) {
          window.rowAnimations.push(this);
          this.pause();
          this.currentTime = 100;
        }
        return result;
      };
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Eliminar", exact: true })
      .press("Enter");
    const clipping = await page.evaluate(() => {
      const bottom = window.survivingInput
        .closest("tr")
        .getBoundingClientRect().bottom;
      const viewportBottom = document
        .querySelector(".backlog-view .grid-scroll")
        .getBoundingClientRect().bottom;
      return bottom - viewportBottom;
    });
    expect(clipping).toBeLessThanOrEqual(1);
    if (reducedMotion === "no-preference")
      await page.screenshot({ path: "/tmp/backlog-removal-middle.png" });
    await page.evaluate(() =>
      window.rowAnimations.forEach((animation) => animation.finish()),
    );
    await expect(page.locator("#backlog-list tr")).toHaveCount(2);
    await expect(page.getByLabel("Descripción de tarea").last()).toBeFocused();
    const result = await page.evaluate(() => ({
      before: window.beforeCells,
      during: window.removalCells,
      frames: window.removalFrames,
      sameInput: window.survivingInput === document.activeElement,
    }));
    expect(result.sameInput).toBe(true);
    if (reducedMotion === "no-preference") {
      expect(result.during).toBeDefined();
      result.during.forEach((cell, i) => {
        expect(cell.x).toBeCloseTo(result.before[i].x, 0);
        expect(cell.width).toBeCloseTo(result.before[i].width, 0);
      });
      expect(JSON.stringify(result.frames)).not.toContain("scale");
    } else expect(result.during).toBeUndefined();
  });
}
