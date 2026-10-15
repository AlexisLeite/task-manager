import { test, expect } from "@playwright/test";
const cell = (page, grid, i, label) =>
  page.getByLabel(`${grid === "tasks" ? "Tarea" : "Plan"} ${i}: ${label}`, {
    exact: true,
  });
const task = (page, i = 1) => cell(page, "tasks", i, "Descripción");
const ref = (page, i = 1) => cell(page, "blocks", i, "Tarea");
const table = (page, grid) => page.locator(`table[data-table="${grid}"]`);
async function open(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await page.getByLabel("Fecha de jornada").fill("2026-10-15");
}
async function example(page) {
  await open(page);
  await page
    .getByRole("button", { name: "Cargar ejemplo", exact: true })
    .click();
}
async function actual(page) {
  await page.getByRole("button", { name: "Realizado", exact: true }).click();
  await page
    .getByRole("button", { name: "Comenzar reconciliación desde el plan" })
    .click();
}
async function menu(page) {
  await page.getByLabel("Copias de seguridad").click();
}

test("clic y Shift+clic seleccionan filas intermedias en ambos sentidos", async ({
  page,
}) => {
  await example(page);
  const selected = table(page, "tasks").locator("tbody tr.selected");
  await task(page, 2).click();
  await cell(page, "tasks", 5, "Prioridad").click({ modifiers: ["Shift"] });
  await expect(selected).toHaveCount(4);
  for (const row of await selected.all())
    await expect(row).toHaveAttribute("aria-selected", "true");
  expect(
    await selected.evaluateAll((rows) =>
      rows.map((row) => Number(row.dataset.index)),
    ),
  ).toEqual([1, 2, 3, 4]);
  await task(page, 3).click({ modifiers: ["Shift"] });
  await expect(selected).toHaveCount(2);
  await task(page, 4).click();
  await expect(selected).toHaveCount(0);
  await cell(page, "tasks", 1, "Identificador").click({ modifiers: ["Shift"] });
  expect(
    await selected.evaluateAll((rows) =>
      rows.map((row) => Number(row.dataset.index)),
    ),
  ).toEqual([0, 1, 2, 3]);
  await page.keyboard.press("Delete");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(1);
});

test("respeta el documento original: texto, cinco definiciones y cuatro bloques con paralelo", async ({
  page,
}) => {
  await example(page);
  await expect(page.getByLabel("Título de la jornada")).toHaveCount(0);
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(page.getByText("Atajos", { exact: true })).toHaveCount(0);
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(5);
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(4);
  await expect(task(page, 3)).toHaveValue(
    "Preparar modelo de dominio para casos de ejemplo",
  );
  await expect(task(page, 4)).toHaveValue(
    "Escribir reglas a mano 1:30hs mínimo",
  );
  await expect(cell(page, "tasks", 2, "Prioridad")).toHaveValue("Alta");
  await expect(ref(page, 2)).toHaveValue("t2,t3");
  await expect(cell(page, "blocks", 2, "Descripción")).toHaveValue(
    "Avanzar con la matriz de casos / Preparar modelo de dominio para casos de ejemplo",
  );
  await expect(page.locator("#total")).toHaveText("Planificado: 6:30 hs");
  await expect(
    page.getByRole("button", { name: /Descanso|Marcar como descanso/ }),
  ).toHaveCount(0);
});
test("definiciones independientes del orden del plan; referencias siguen al identificador", async ({
  page,
}) => {
  await example(page);
  await cell(page, "tasks", 2, "Identificador").fill("matriz");
  await expect(ref(page, 2)).toHaveValue("matriz,t3");
  await cell(page, "tasks", 1, "Duración").fill("3:00");
  await expect(cell(page, "blocks", 1, "Hora fin")).toHaveValue("17:30");
  await ref(page, 2).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(ref(page)).toHaveValue("matriz,t3");
  await expect(task(page)).toHaveValue("Instalar el centro de decisiones");
  await expect(cell(page, "blocks", 1, "Hora inicio")).toHaveValue("16:30");
});
test("guardar y recargar conserva notas libres, prioridades y datos de las dos partes", async ({
  page,
}) => {
  await example(page);
  await task(page).fill("Nombre actualizado");
  await cell(page, "tasks", 2, "Prioridad").selectOption("Media");
  await cell(page, "blocks", 1, "Hora inicio").fill("14:00");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(task(page)).toHaveValue("Nombre actualizado");
  await expect(cell(page, "blocks", 1, "Descripción")).toHaveValue(
    "Nombre actualizado",
  );
  await expect(cell(page, "tasks", 2, "Prioridad")).toHaveValue("Media");
  await expect(cell(page, "blocks", 1, "Hora inicio")).toHaveValue("14:00");
});
test("Tab y flechas permiten escribir tareas y añadirlas al plan sin formularios", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
  await expect(cell(page, "tasks", 1, "Identificador")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.type("2:00");
  await page.keyboard.press("Tab");
  await cell(page, "tasks", 1, "Prioridad").selectOption("Alta");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Desarrollar");
  await page.keyboard.press("Tab");
  await expect(cell(page, "tasks", 2, "Identificador")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(task(page)).toBeFocused();
  await cell(page, "blocks", 1, "Hora inicio").focus();
  await expect(cell(page, "blocks", 1, "Hora inicio")).toBeFocused();
  await page.keyboard.type("09:00");
  await page.keyboard.press("Tab");
  await expect(cell(page, "blocks", 1, "Hora fin")).toHaveValue("11:00");
});
test("Home y Shift+End seleccionan una línea completa para cortar, con clipboard real", async ({
  page,
}) => {
  await example(page);
  await task(page, 2).focus();
  await page.keyboard.press("Home");
  await expect(cell(page, "tasks", 2, "Identificador")).toBeFocused();
  await page.keyboard.press("Shift+End");
  await expect(table(page, "tasks").locator("tr.selected")).toHaveCount(1);
  await page.keyboard.press("Control+x");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(4);
  await cell(page, "tasks", 4, "Identificador").focus();
  await page.keyboard.press("Control+v");
  await expect(cell(page, "tasks", 4, "Identificador")).toHaveValue("t2");
  await expect(ref(page, 2)).toHaveValue("t2,t3");
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(4);
});
test("Shift+abajo selecciona líneas sin activar antes un modo de selección, y Supr elimina", async ({
  page,
}) => {
  await example(page);
  await task(page, 2).focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(table(page, "tasks").locator("tr.selected")).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(3);
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(5);
  await expect(ref(page, 2)).toHaveValue("t2,t3");
  await page.keyboard.press("Control+Shift+z");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(3);
});
test("cortar y pegar un rango de tareas conserva su planificación y el orden de sus referencias", async ({
  page,
}) => {
  await example(page);
  await task(page).focus();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Control+x");
  await cell(page, "tasks", 3, "Identificador").focus();
  await page.keyboard.press("Control+v");
  await expect(cell(page, "tasks", 3, "Identificador")).toHaveValue("t1");
  await expect(cell(page, "tasks", 4, "Identificador")).toHaveValue("t2");
  await expect(ref(page)).toHaveValue("t1");
  await expect(ref(page, 2)).toHaveValue("t2,t3");
  await expect(page.locator("#total")).toHaveText("Planificado: 6:30 hs");
});
test("pegar filas al inicio del cursor inserta antes, y al final de la línea inserta después", async ({
  page,
}) => {
  await example(page);
  await ref(page).focus();
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("Control+c");
  await ref(page, 3).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Control+v");
  await expect(ref(page, 3)).toHaveValue("t1");
  await expect(ref(page, 4)).toHaveValue("t5");
  await ref(page, 5).focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+v");
  await expect(ref(page, 6)).toHaveValue("t1");
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(6);
});
test("mover un grupo de líneas con Alt+abajo mantiene el grupo y las definiciones", async ({
  page,
}) => {
  await example(page);
  await task(page).focus();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Alt+ArrowDown");
  await expect(cell(page, "tasks", 1, "Identificador")).toHaveValue("t3");
  await expect(cell(page, "tasks", 2, "Identificador")).toHaveValue("t1");
  await expect(cell(page, "tasks", 3, "Identificador")).toHaveValue("t2");
  await expect(table(page, "tasks").locator("tr.selected")).toHaveCount(2);
  await expect(ref(page, 2)).toHaveValue("t2,t3");
});
test("selección de texto dentro de un campo y texto introductorio mantiene el clipboard nativo", async ({
  page,
}) => {
  await example(page);
  await task(page).focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+x");
  await expect(task(page)).toHaveValue("");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(5);
  await page.keyboard.press("Control+v");
  await expect(task(page)).toHaveValue("Instalar el centro de decisiones");
  await page.keyboard.press("Shift+End");
  await task(page, 3).focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(5);
});
test("pegar TSV de una spreadsheet en ambas secciones", async ({ page }) => {
  await example(page);
  await page.evaluate(() =>
    navigator.clipboard.writeText(
      "t6\t1:00\t(P1)\tRevisar\nt7\t0:30\t\tPreparar",
    ),
  );
  await cell(page, "tasks", 2, "Identificador").focus();
  await page.keyboard.press("Control+v");
  await expect(task(page, 2)).toHaveValue("Revisar");
  await expect(task(page, 3)).toHaveValue("Preparar");
  await page.evaluate(() =>
    navigator.clipboard.writeText("t6,t7\tEn paralelo\t09:00\t10:00"),
  );
  await ref(page).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Control+v");
  await expect(ref(page)).toHaveValue("t6,t7");
  await expect(cell(page, "blocks", 1, "Hora fin")).toHaveValue("10:00");
});
test("cortar todas las filas y pegar de nuevo restaura las referencias", async ({
  page,
}) => {
  await example(page);
  await task(page).focus();
  await page.keyboard.press("Shift+End");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Control+x");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(0);
  await page.keyboard.press("Control+v");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(5);
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(4);
  await expect(ref(page, 2)).toHaveValue("t2,t3");
});
test("drag de bloques y de definiciones conserva horarios y referencias", async ({
  page,
}) => {
  await example(page);
  await page
    .getByRole("button", { name: "Seleccionar bloque 1", exact: true })
    .dragTo(table(page, "blocks").locator("tbody tr").nth(2));
  await expect(ref(page, 3)).toHaveValue("t1");
  await expect(cell(page, "blocks", 3, "Hora inicio")).toHaveValue("14:30");
  await page
    .getByRole("button", { name: "Seleccionar tarea 1", exact: true })
    .dragTo(table(page, "tasks").locator("tbody tr").nth(3));
  await expect(cell(page, "tasks", 4, "Identificador")).toHaveValue("t1");
  await expect(ref(page, 1)).toHaveValue("t1");
});
test("encadenar horarios es explícito y reversible", async ({ page }) => {
  await example(page);
  await cell(page, "blocks", 1, "Hora inicio").fill("08:00");
  await page.getByRole("button", { name: "Encadenar horarios" }).click();
  await expect(cell(page, "blocks", 2, "Hora inicio")).toHaveValue("10:00");
  await expect(cell(page, "blocks", 3, "Hora inicio")).toHaveValue("12:30");
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(cell(page, "blocks", 2, "Hora inicio")).toHaveValue("16:30");
});
test("reconciliación copia las dos partes y el texto sin cambiar la planificación", async ({
  page,
}) => {
  await example(page);
  await actual(page);
  await task(page).fill("Instalación realizada");
  await cell(page, "blocks", 1, "Hora fin").fill("16:00");
  await cell(page, "tasks", 1, "Prioridad").selectOption("Baja");
  await page
    .getByRole("button", { name: "Planificación", exact: true })
    .click();
  await expect(task(page)).toHaveValue("Instalar el centro de decisiones");
  await expect(cell(page, "blocks", 1, "Hora fin")).toHaveValue("16:30");
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await page.getByRole("button", { name: "Realizado", exact: true }).click();
  await expect(task(page)).toHaveValue("Instalación realizada");
  await expect(cell(page, "tasks", 1, "Prioridad")).toHaveValue("Baja");
});
test("sugerencias se eligen con teclado y conservan identidad entre jornadas", async ({
  page,
}) => {
  await example(page);
  await actual(page);
  await page.getByRole("button", { name: "Día siguiente" }).click();
  await page
    .getByRole("button", { name: "Planificación", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
  await task(page).fill("Escribir");
  await expect(
    page.getByRole("option", { name: "Escribir reglas a mano 1:30hs mínimo" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(task(page)).toHaveValue("Escribir reglas a mano 1:30hs mínimo");
  await cell(page, "tasks", 1, "Duración").fill("01:00");
  await cell(page, "blocks", 1, "Hora inicio").fill("10:00");
  await actual(page);
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("jornada.v1")),
  );
  expect(data.days["2026-10-15"].actual.tasks[3].taskId).toBe(
    data.days["2026-10-16"].actual.tasks[0].taskId,
  );
});
test("resumen mensual agrupa identidades, no duplica paralelos y separa meses", async ({
  page,
}) => {
  await example(page);
  await actual(page);
  await page.getByRole("button", { name: "Mes", exact: true }).click();
  await expect(page.locator("#month-actual")).toHaveText("6:30 hs");
  await expect(
    page
      .getByRole("table", { name: "Distribución de horas" })
      .locator("tbody tr"),
  ).toHaveCount(5);
  await expect(
    page.getByRole("row").filter({ hasText: "Avanzar con la matriz de casos" }),
  ).toContainText("2:30 hs");
  await page.getByLabel("Fecha de jornada").fill("2026-11-01");
  await expect(page.locator("#month-actual")).toHaveText("0:00 hs");
  await page.getByLabel("Fecha de jornada").fill("2026-10-15");
  await page.locator(".day-list button").click();
  await expect(ref(page, 2)).toHaveValue("t2,t3");
});
test("referencias desconocidas y horas inválidas se marcan sin contar tiempos anteriores", async ({
  page,
}) => {
  await example(page);
  await expect(ref(page)).toHaveAttribute("readonly", "");
  await cell(page, "blocks", 1, "Hora inicio").fill("25:00");
  await expect(cell(page, "blocks", 1, "Hora inicio")).toHaveValue("14:30");
  await cell(page, "tasks", 1, "Duración").fill("");
  await expect(cell(page, "blocks", 1, "Hora fin")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByRole("button", { name: "Encadenar horarios" }).click();
  await expect(page.locator("#notice")).toContainText("horarios válidos");
});
test("exportar e importar mantiene toda la información y permite deshacer", async ({
  page,
}) => {
  await example(page);
  await menu(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar copia" }).click();
  const download = await pending;
  const path = await download.path();
  await task(page).fill("Cambio temporal");
  page.on("dialog", (d) => d.accept());
  await page.locator("#import").setInputFiles(path);
  await expect(page.locator("#notice")).toHaveText("Copia importada.");
  await expect(task(page)).toHaveValue("Instalar el centro de decisiones");
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(task(page)).toHaveValue("Cambio temporal");
});
test("el tema oscuro se recuerda al recargar, navegar y volver al claro", async ({
  page,
}) => {
  await example(page);
  await page.getByRole("button", { name: "Activar tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("jornada.theme"))).toBe(
    "dark",
  );
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(25, 27, 30)",
  );
  await page.screenshot({
    path: "test-results/jornada-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Mes", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Activar tema claro" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("jornada.theme"))).toBe(
    "light",
  );
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
});
test("migración conserva datos de la versión anterior y guarda copia antes de escribir", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  const old = {
    version: 1,
    tasks: [],
    days: {
      "2026-10-15": {
        plan: [
          {
            id: "old",
            name: "Trabajo previo",
            start: "11:00",
            end: "12:30",
            kind: "Trabajo",
            notes: "Mis notas",
            taskId: null,
          },
        ],
        actual: null,
      },
    },
  };
  await page.evaluate(
    (d) => localStorage.setItem("jornada.v1", JSON.stringify(d)),
    old,
  );
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await page.getByLabel("Fecha de jornada").fill("2026-10-15");
  await expect(task(page)).toHaveValue("Trabajo previo");
  await expect(cell(page, "blocks", 1, "Descripción")).toHaveValue(
    "Trabajo previo",
  );
  await cell(page, "tasks", 1, "Prioridad").selectOption("Alta");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jornada.backup.v1")),
    ),
  ).toEqual(old);
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(task(page)).toHaveValue("Trabajo previo");
});
test("no sobrescribe datos corruptos y rechaza importar estructuras inválidas", async ({
  page,
}) => {
  await example(page);
  await page.locator("#import").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2,"days":{},"tasks":[{}]}'),
  });
  await expect(page.locator("#notice")).toContainText("formato inválido");
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(5);
  await page.evaluate(() =>
    localStorage.setItem("jornada.v1", '{"version":999}'),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No pudimos leer tus datos" }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("jornada.v1"))).toBe(
    '{"version":999}',
  );
});
test("error de almacenamiento no se presenta como guardado", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await example(page);
  await expect(page.locator("#saved")).toHaveText("No se pudo guardar");
  await expect(page.locator("#notice")).toContainText("Exportá una copia");
});
test("captura clara, pantalla angosta y ausencia de errores o solicitudes externas", async ({
  page,
}) => {
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:5173")) external.push(r.url());
  });
  await example(page);
  await page.screenshot({
    path: "test-results/jornada-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await task(page).fill("Desde móvil");
  await page.getByRole("button", { name: "Activar tema oscuro" }).click();
  await page.screenshot({
    path: "test-results/jornada-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("TODAS las definiciones aparecen automáticamente en el plan sin un segundo alta", async ({
  page,
}) => {
  await open(page);
  for (let i = 1; i <= 3; i++) {
    await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
    await task(page, i).fill(`Pendiente ${i}`);
    await cell(page, "tasks", i, "Duración").fill("01:30");
  }
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(3);
  for (let i = 1; i <= 3; i++) {
    await expect(ref(page, i)).toHaveValue(`t${i}`);
    await expect(cell(page, "blocks", i, "Descripción")).toHaveValue(
      `Pendiente ${i}`,
    );
  }
  await expect(
    page.getByRole("button", { name: /Añadir t\d+ al plan/ }),
  ).toHaveCount(0);
  await cell(page, "blocks", 2, "Hora inicio").fill("09:00");
  await expect(cell(page, "blocks", 2, "Hora fin")).toHaveValue("10:30");
  await expect(cell(page, "blocks", 2, "Hora fin")).toBeEditable();
  await page
    .getByRole("button", { name: "Seleccionar bloque 2", exact: true })
    .click();
  await page.keyboard.press("Delete");
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(3);
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("jornada.v1")).days["2026-10-15"].plan,
  );
  expect(new Set(saved.blocks.flatMap((b) => b.taskIds))).toEqual(
    new Set(saved.tasks.map((t) => t.id)),
  );
});
test("duración acepta solo hh:mm, restaura entradas incompletas y recalcula el fin", async ({
  page,
}) => {
  await example(page);
  const estimate = cell(page, "tasks", 1, "Duración");
  await expect(estimate).toHaveValue("02:00");
  await estimate.fill("abc");
  await expect(estimate).toHaveValue("02:00");
  await estimate.fill("02:99");
  await expect(estimate).toHaveValue("02:00");
  await estimate.fill("0130");
  await expect(estimate).toHaveValue("01:30");
  await expect(cell(page, "blocks", 1, "Hora fin")).toHaveValue("16:00");
  await estimate.fill("01:");
  await task(page).focus();
  await expect(estimate).toHaveValue("01:30");
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(estimate).toHaveValue("01:30");
});
test("prioridad solo admite Baja Media Alta y cambia círculos verde amarillo rojo en el plan", async ({
  page,
}) => {
  await example(page);
  const select = cell(page, "tasks", 1, "Prioridad");
  await expect(select.locator("option")).toHaveText(["Baja", "Media", "Alta"]);
  const colors = {
    Baja: "rgb(50, 168, 82)",
    Media: "rgb(225, 181, 33)",
    Alta: "rgb(224, 74, 71)",
  };
  for (const [priority, color] of Object.entries(colors)) {
    await select.selectOption(priority);
    await expect(
      page.getByRole("img", { name: `t1: ${priority}`, exact: true }),
    ).toHaveCSS("background-color", color);
  }
  await cell(page, "tasks", 3, "Prioridad").selectOption("Baja");
  await expect(
    table(page, "blocks")
      .locator("tbody tr")
      .nth(1)
      .getByRole("img", { name: "t2: Alta", exact: true }),
  ).toBeVisible();
  await expect(
    table(page, "blocks")
      .locator("tbody tr")
      .nth(1)
      .getByRole("img", { name: "t3: Baja", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(select).toHaveValue("Alta");
  await expect(
    page.getByRole("img", { name: "t3: Baja", exact: true }),
  ).toHaveCSS("background-color", colors.Baja);
});

test("cortar un bloque paralelo y pegarlo mueve el bloque sin perder ni duplicar tareas", async ({
  page,
}) => {
  await example(page);
  await ref(page, 2).focus();
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("Control+x");
  await ref(page, 1).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Control+v");
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(4);
  await expect(ref(page, 1)).toHaveValue("t2,t3");
  const data = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("jornada.v1")).days["2026-10-15"].plan,
  );
  expect(data.blocks.flatMap((b) => b.taskIds).length).toBe(5);
  expect(new Set(data.blocks.flatMap((b) => b.taskIds))).toEqual(
    new Set(data.tasks.map((t) => t.id)),
  );
});
test("deshacer texto libre conserva foco y permite seguir escribiendo", async ({
  page,
}) => {
  await example(page);
  const intro = task(page);
  await intro.fill("Nota");
  await page.keyboard.press("Control+z");
  await expect(intro).toBeFocused();
  await page.keyboard.press("Control+Shift+z");
  await expect(intro).toHaveValue("Nota");
  await expect(intro).toBeFocused();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" final");
  await expect(intro).toHaveValue("Nota final");
});
test("el resumen suma una misma tarea realizada en días distintos", async ({
  page,
}) => {
  await example(page);
  await actual(page);
  await page.getByRole("button", { name: "Día siguiente" }).click();
  await page
    .getByRole("button", { name: "Planificación", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Tarea", exact: true }).click();
  await task(page).fill("Instalar el centro de decisiones");
  await cell(page, "tasks", 1, "Duración").fill("01:00");
  await cell(page, "blocks", 1, "Hora inicio").fill("09:00");
  await actual(page);
  await page.getByRole("button", { name: "Mes", exact: true }).click();
  await expect(page.locator("#month-actual")).toHaveText("7:30 hs");
  const row = page
    .getByRole("table", { name: "Distribución de horas" })
    .getByRole("row")
    .filter({ hasText: "Instalar el centro de decisiones" });
  await expect(row).toContainText("3:00 hs");
  await expect(row.locator("td").nth(1)).toHaveText("2");
});

test("abreviaturas de duración e inicio y edición bidireccional de fin sin perder foco", async ({
  page,
}) => {
  await example(page);
  const estimate = cell(page, "tasks", 1, "Duración"),
    start = cell(page, "blocks", 1, "Hora inicio"),
    end = cell(page, "blocks", 1, "Hora fin");
  await estimate.fill("2");
  await page.keyboard.press("Tab");
  await expect(estimate).toHaveValue("02:00");
  await start.fill("9");
  await page.keyboard.press("Tab");
  await expect(start).toHaveValue("09:00");
  await expect(end).toHaveValue("11:00");
  await expect(end).toBeFocused();
  await end.fill("12:30");
  await expect(estimate).toHaveValue("03:30");
  await expect(end).toBeFocused();
  await start.fill("10:00");
  await expect(end).toHaveValue("13:30");
  await estimate.fill("230");
  await page.keyboard.press("Tab");
  await expect(estimate).toHaveValue("02:30");
  await expect(end).toHaveValue("12:30");
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(estimate).toHaveValue("02:30");
  await expect(start).toHaveValue("10:00");
  await expect(end).toHaveValue("12:30");
});
test("cambios de nombres actualizan bloques existentes y el fin de un paralelo actualiza sus duraciones", async ({
  page,
}) => {
  await example(page);
  await task(page).fill("Nueva instalación");
  await expect(cell(page, "blocks", 1, "Descripción")).toHaveValue(
    "Nueva instalación",
  );
  await task(page, 2).fill("Matriz actualizada");
  await expect(cell(page, "blocks", 2, "Descripción")).toHaveValue(
    "Matriz actualizada / Preparar modelo de dominio para casos de ejemplo",
  );
  await cell(page, "blocks", 2, "Hora fin").fill("20:00");
  await expect(cell(page, "tasks", 2, "Duración")).toHaveValue("03:30");
  await expect(cell(page, "tasks", 3, "Duración")).toHaveValue("03:30");
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(cell(page, "blocks", 1, "Descripción")).toHaveValue(
    "Nueva instalación",
  );
});
test("repara duplicados vacíos sin perder intervalos distintos ni datos anteriores", async ({
  page,
}) => {
  await example(page);
  const original = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("jornada.v1"));
    delete data.syncRevision;
    const d = data.days["2026-10-15"].plan;
    d.intro = "Texto previo que no debe perderse";
    d.blocks[0].description = "Descripción anterior";
    delete d.blocks[0].descriptionSource;
    d.blocks.push({
      ...d.blocks[0],
      id: "stale-empty",
      start: "",
      end: "",
      description: "",
    });
    d.blocks.push({
      ...d.blocks[0],
      id: "separate-session",
      start: "08:00",
      end: "10:00",
    });
    localStorage.setItem("jornada.v1", JSON.stringify(data));
    localStorage.removeItem("jornada.backup.before-sync");
    return data;
  });
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(5);
  await expect(cell(page, "blocks", 1, "Hora inicio")).toHaveValue("14:30");
  await expect(cell(page, "blocks", 5, "Hora inicio")).toHaveValue("08:00");
  await task(page).fill("Instalación actualizada");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const stored = await page.evaluate(() => ({
    current: JSON.parse(localStorage.getItem("jornada.v1")),
    backup: JSON.parse(localStorage.getItem("jornada.backup.before-sync")),
  }));
  expect(stored.backup).toEqual(original);
  expect(stored.current.days["2026-10-15"].plan.intro).toBe(
    "Texto previo que no debe perderse",
  );
  expect(
    stored.current.days["2026-10-15"].plan.recoveredBlocks.some(
      (b) => b.id === "stale-empty",
    ),
  ).toBe(true);
  expect(
    stored.current.days["2026-10-15"].plan.blocks[0].previousDescription,
  ).toBe("Descripción anterior");
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(table(page, "blocks").locator("tbody tr")).toHaveCount(5);
});
test("el foco queda contenido en la celda con espacio alrededor del outline", async ({
  page,
}) => {
  await example(page);
  const input = task(page);
  await input.focus();
  const geometry = await input.evaluate((el) => {
    const a = el.getBoundingClientRect(),
      b = el.closest("td").getBoundingClientRect(),
      s = getComputedStyle(el);
    return {
      left: a.left - b.left,
      right: b.right - a.right,
      top: a.top - b.top,
      bottom: b.bottom - a.bottom,
      extent: parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset),
    };
  });
  for (const side of ["left", "right", "top", "bottom"])
    expect(geometry[side]).toBeGreaterThanOrEqual(geometry.extent);
  await page.screenshot({
    path: "test-results/jornada-focus.png",
    fullPage: true,
  });
});

test("Foco muestra actividades actuales en paralelo y actualiza el tiempo restante", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T16:30:00") });
  await example(page);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await expect(page.locator("nav button")).toHaveText([
    "Foco",
    "Jornada",
    "Mes",
  ]);
  await expect(page.locator(".focus-list [data-focus-id]")).toHaveCount(2);
  await expect(page.locator(".focus-list")).toContainText(
    "Avanzar con la matriz de casos",
  );
  await expect(page.locator(".focus-list")).toContainText(
    "Preparar modelo de dominio",
  );
  await expect(page.locator(".focus-list [data-focus-id] time")).toHaveText([
    "02:30:00",
    "02:30:00",
  ]);
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.getByLabel("Fecha de jornada")).toBeHidden();
  await page.clock.fastForward(1000);
  await expect(page.locator(".focus-list [data-focus-id] time")).toHaveText([
    "02:29:59",
    "02:29:59",
  ]);
  await page.clock.fastForward(8999000);
  await expect(page.locator(".focus-list [data-focus-id]")).toHaveCount(1);
  await expect(page.locator(".focus-list")).toContainText(
    "Descanso de media hora",
  );
  await expect(page.locator(".focus-list [data-focus-id] time")).toHaveText([
    "00:30:00",
  ]);
  await page.screenshot({ path: "test-results/foco.png", fullPage: true });
  await page.clock.fastForward(7200000);
  await expect(page.locator(".focus-list [data-focus-id]")).toHaveCount(0);
  await expect(
    page.getByText("No hay actividades planificadas para este momento."),
  ).toBeVisible();
});

test("Foco usa hoy aunque Jornada tenga otra fecha o esté en Realizado", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T15:00:00") });
  await example(page);
  await actual(page);
  await task(page).fill("Solo realizado");
  await page.getByLabel("Fecha de jornada").fill("2026-10-14");
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await expect(page.locator(".focus-list [data-focus-id]")).toHaveCount(1);
  await expect(page.locator(".focus-list")).toContainText(
    "Instalar el centro de decisiones",
  );
  await expect(page.locator(".focus-list")).not.toContainText("Solo realizado");
  await expect(page.locator(".focus-list [data-focus-id] time")).toHaveText([
    "01:30:00",
  ]);
  await page.clock.fastForward(9 * 3600000);
  await expect(
    page.getByText("No hay actividades planificadas para este momento."),
  ).toBeVisible();
});

test("Foco abre por defecto, conserva controles al contar y guarda orden y prioridad", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await example(page);
  await page.goto("/");
  await expect(page.locator("#nav-focus")).toHaveClass("active");
  const cards = page.locator("[data-focus-id]");
  const firstName = await cards.first().locator("h2").textContent();
  await cards.first().locator(".focus-priority summary").click();
  await cards
    .first()
    .locator(".focus-priority")
    .getByRole("button", { name: "Baja", exact: true })
    .click();
  await cards.first().locator(".focus-priority summary").focus();
  const initial = Number(
    await cards.first().getByRole("progressbar").getAttribute("aria-valuenow"),
  );
  await page.clock.fastForward(60000);
  await expect(cards.first().locator(".focus-priority summary")).toBeFocused();
  expect(
    Number(
      await cards
        .first()
        .getByRole("progressbar")
        .getAttribute("aria-valuenow"),
    ),
  ).toBeLessThan(initial);
  await cards.first().focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(cards.last().locator("h2")).toHaveText(firstName);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await expect(cards.last().locator("h2")).toHaveText(firstName);
  await expect(
    cards.last().locator(".focus-priority summary .priority-dot"),
  ).toHaveClass("priority-dot baja");
  await cards.last().focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(cards.first().locator("h2")).toHaveText(firstName);
  await cards.first().locator("h2").dragTo(cards.last());
  await expect(cards.last().locator("h2")).toHaveText(firstName);
  await expect(cards.first().getByRole("progressbar")).toHaveCSS(
    "height",
    "3px",
  );
  await page.getByRole("button", { name: "Activar tema oscuro" }).click();
  await page.screenshot({ path: "test-results/foco-dark.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 500 });
  await page.evaluate(() => window.scrollTo(0, 500));
  expect((await page.locator(".toolbar").boundingBox()).y).toBe(0);
  await page.screenshot({
    path: "test-results/foco-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(cell(page, "tasks", 2, "Prioridad")).toHaveValue("Baja");
});

test("Foco anticipa tres horas en gris sin activar controles y anima al terminar", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T16:29:59") });
  await example(page);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  const upcoming = page.locator(".focus-upcoming[data-entry-key]");
  await expect(upcoming).toHaveCount(3);
  await expect(upcoming.locator("h2")).toHaveText([
    "Avanzar con la matriz de casos",
    "Preparar modelo de dominio para casos de ejemplo",
    "Descanso de media hora",
  ]);
  await expect(
    upcoming.locator('select, [role="progressbar"], [data-focus-move]'),
  ).toHaveCount(0);
  const sizes = await page.evaluate(() => ({
    active: getComputedStyle(document.querySelector("[data-focus-id] h2"))
      .fontSize,
    next: getComputedStyle(document.querySelector(".focus-upcoming h2"))
      .fontSize,
    color: getComputedStyle(document.querySelector(".focus-upcoming")).color,
    muted: getComputedStyle(document.documentElement)
      .getPropertyValue("--muted")
      .trim(),
  }));
  expect(parseFloat(sizes.next)).toBeLessThan(parseFloat(sizes.active));
  await expect(upcoming.first()).toHaveCSS("color", "rgb(133, 140, 135)");
  await page.clock.runFor(1300);
  await expect(page.locator("[data-focus-id]")).toHaveCount(2);
  await expect(upcoming).toHaveCount(2);
  await page.clock.fastForward(2 * 3600000 + 29 * 60000 + 58000);
  await page.clock.runFor(400);
  // Finish earlier browser animations before observing the next clock boundary.
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => {
      if (animation.effect?.target?.closest?.(".focus-list"))
        animation.finish();
    }),
  );
  await page.evaluate(() => {
    window.focusAnimations = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.matches(".focus-card"))
        window.focusAnimations.push({
          name: this.querySelector("h2")?.textContent,
          frames,
        });
      return original.call(this, frames, options);
    };
    window.survivingRow = [
      ...document.querySelectorAll(".focus-upcoming"),
    ].find((el) => el.textContent.includes("Escribir reglas"));
  });
  await page.clock.runFor(1600);
  await expect(page.locator("[data-focus-id] h2")).toHaveText(
    "Descanso de media hora",
  );
  expect(
    await page.evaluate(
      () =>
        window.survivingRow ===
        [...document.querySelectorAll(".focus-upcoming")].find((el) =>
          el.textContent.includes("Escribir reglas"),
        ),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      window.focusAnimations.some(
        (a) =>
          a.name.includes("Escribir reglas") &&
          a.frames.some((f) => f.transform?.includes("translate")),
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Activar tema oscuro" }).click();
  await page.clock.runFor(1000);
  await page.screenshot({
    path: "test-results/foco-upcoming.png",
    fullPage: true,
  });
});

test("Foco incluye próximas tareas al cruzar medianoche y respeta el límite de tres horas", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T23:00:00") });
  await example(page);
  await page.getByLabel("Fecha de jornada").fill("2026-10-16");
  await page
    .getByRole("button", { name: "Cargar ejemplo", exact: true })
    .click();
  await cell(page, "blocks", 1, "Hora inicio").fill("02:00");
  await cell(page, "blocks", 2, "Hora inicio").fill("02:01");
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await expect(page.locator("[data-focus-id]")).toHaveCount(0);
  await expect(page.locator(".focus-upcoming")).toHaveCount(1);
  await expect(page.locator(".focus-upcoming h2")).toHaveText(
    "Instalar el centro de decisiones",
  );
  await expect(page.locator(".focus-upcoming time")).toHaveText(
    "02:00 - 04:00",
  );
  await page.clock.runFor(61000);
  await expect(page.locator(".focus-upcoming")).toHaveCount(3);
});

async function focusAction(page, name, action) {
  const row = page
    .locator(".focus-card[data-entry-key]")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await row.locator(".focus-remaining summary").click();
  await row.getByRole("button", { name: action, exact: true }).click();
}

test("terminar una tarea paralela reconcilia solo su tiempo y cancelar no registra horas", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:10:00") });
  await example(page);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  const first = page.locator("[data-focus-id]").first();
  await first.locator(".focus-remaining summary").click();
  await expect(first.locator(".focus-remaining .focus-menu button")).toHaveText(
    ["Terminar tarea", "Cancelar tarea"],
  );
  await page.clock.runFor(1000);
  await expect(first.locator(".focus-remaining details")).toHaveAttribute(
    "open",
    "",
  );
  await first
    .getByRole("button", { name: "Terminar tarea", exact: true })
    .click();
  await expect(page.locator("[data-focus-id]")).toHaveCount(1);
  await focusAction(
    page,
    "Preparar modelo de dominio para casos de ejemplo",
    "Cancelar tarea",
  );
  await expect(page.locator("[data-focus-id]")).toHaveCount(0);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await expect(page.locator("[data-focus-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(5);
  await page.getByRole("button", { name: "Realizado", exact: true }).click();
  await expect(table(page, "tasks").locator("tbody tr")).toHaveCount(1);
  await expect(task(page)).toHaveValue("Avanzar con la matriz de casos");
  await expect(cell(page, "blocks", 1, "Hora inicio")).toHaveValue("16:30");
  await expect(cell(page, "blocks", 1, "Hora fin")).toHaveValue("17:10");
  await expect(cell(page, "tasks", 1, "Duración")).toHaveValue("00:40");
  await page.getByRole("button", { name: "Mes", exact: true }).click();
  await expect(page.locator("#month-actual")).toHaveText("0:40 hs");
});

test("pendientes ofrecen iniciar o cancelar; iniciar conserva duración y deja el resto del paralelo pendiente", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T15:15:00") });
  await example(page);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  const upcoming = page.locator(".focus-upcoming[data-entry-key]").first();
  await upcoming.locator("summary").click();
  await expect(upcoming.locator(".focus-menu button")).toHaveText([
    "Iniciar tarea",
    "Cancelar tarea",
  ]);
  await upcoming
    .getByRole("button", { name: "Iniciar tarea", exact: true })
    .click();
  const started = page.locator("[data-focus-id]").filter({
    has: page.getByRole("heading", {
      name: "Avanzar con la matriz de casos",
      exact: true,
    }),
  });
  await expect(started).toHaveCount(1);
  await expect(started.locator("time")).toHaveText("02:30:00");
  await expect(page.locator(".focus-upcoming[data-entry-key] h2")).toHaveText([
    "Preparar modelo de dominio para casos de ejemplo",
  ]);
  await focusAction(
    page,
    "Preparar modelo de dominio para casos de ejemplo",
    "Cancelar tarea",
  );
  await expect(page.locator(".focus-upcoming[data-entry-key]")).toHaveCount(0);
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await expect(page.locator(".focus-upcoming[data-entry-key]")).toHaveCount(0);
  const state = await page.evaluate(
    () => JSON.parse(localStorage.getItem("jornada.v1")).days["2026-10-15"],
  );
  expect(state.actual).toBeNull();
  const startedTask = state.plan.tasks.find(
    (t) => t.name === "Avanzar con la matriz de casos",
  );
  expect(
    state.plan.blocks.some(
      (b) =>
        b.taskIds.includes(startedTask.id) &&
        b.start === "15:15" &&
        b.end === "17:45",
    ),
  ).toBe(true);
  await page.clock.fastForward(30 * 60000);
  await focusAction(page, "Avanzar con la matriz de casos", "Terminar tarea");
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await page.getByRole("button", { name: "Realizado", exact: true }).click();
  await expect(cell(page, "blocks", 1, "Hora inicio")).toHaveValue("15:15");
  await expect(cell(page, "blocks", 1, "Hora fin")).toHaveValue("15:45");
});

test("terminar con reconciliación existente reemplaza esa ocurrencia y conserva las otras", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await example(page);
  await actual(page);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await focusAction(page, "Avanzar con la matriz de casos", "Terminar tarea");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  const state = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("jornada.v1")).days["2026-10-15"].actual,
  );
  const matrix = state.tasks.find(
    (t) => t.name === "Avanzar con la matriz de casos",
  );
  const domain = state.tasks.find((t) => t.name.startsWith("Preparar modelo"));
  const intervals = state.blocks.filter((b) => b.taskIds.includes(matrix.id));
  expect(intervals).toHaveLength(1);
  expect(intervals[0].end).toBe("17:00");
  expect(state.blocks.find((b) => b.taskIds.includes(domain.id)).end).toBe(
    "19:00",
  );
  await page.locator("[data-focus-id] .focus-remaining summary").click();
  await page.screenshot({ path: "test-results/foco-menu.png", fullPage: true });
});

test("las próximas tareas se iluminan al pasar el cursor sin activarse", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await example(page);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await page.getByRole("button", { name: "Activar tema oscuro" }).click();
  const next = page.locator(".focus-upcoming[data-entry-key]").first();
  await expect(page.locator("[data-focus-id] h2").first()).toHaveCSS(
    "color",
    "rgb(185, 192, 186)",
  );
  const activeColor = "rgb(185, 192, 186)";
  await expect(next).toHaveCSS("color", "rgb(98, 107, 101)");
  await next.hover();
  for (const row of await page.locator(".focus-upcoming").all()) {
    await expect(row.locator("h2")).toHaveCSS("color", activeColor);
    await expect(row.locator("time")).toHaveCSS("color", activeColor);
  }
  await expect(next.getByRole("progressbar")).toHaveCount(0);
  await expect(next.locator("[data-focus-priority]")).toHaveCount(0);
  await page.locator("#nav-focus").hover();
  await expect(next).toHaveCSS("color", "rgb(98, 107, 101)");
});

test("Foco simplifica la fila, permite drag desde el contador y conserva resaltado con menú abierto", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await example(page);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await page.getByRole("button", { name: "Activar tema oscuro" }).click();
  await expect(page.locator(".focus-controls, .focus-moves")).toHaveCount(0);
  await expect(page.getByText("Tiempo restante", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Inicio", { exact: true })).toHaveCount(0);
  const active = page.locator("[data-focus-id]");
  const first = await active.first().locator("h2").textContent();
  await active.first().locator("time").dragTo(active.last());
  await expect(active.last().locator("h2")).toHaveText(first);
  await active
    .last()
    .getByLabel("Prioridad de " + first, { exact: true })
    .click();
  await active
    .last()
    .locator(".focus-priority")
    .getByRole("button", { name: "Baja", exact: true })
    .click();
  await expect(
    active.last().locator(".focus-priority summary .priority-dot"),
  ).toHaveClass("priority-dot baja");
  const next = page.locator(".focus-upcoming[data-entry-key]").first();
  await next.locator("summary").click();
  await page.locator("#nav-focus").hover();
  await page.clock.runFor(1000);
  await expect(next).toHaveCSS("color", "rgb(185, 192, 186)");
  await expect(next.locator("details")).toHaveAttribute("open", "");
  await page.screenshot({
    path: "test-results/foco-simple.png",
    fullPage: true,
  });
  await next.locator("summary").focus();
  await page.keyboard.press("Escape");
  await expect(next).toHaveCSS("color", "rgb(98, 107, 101)");
});

test("los menús de prioridad y acciones se cierran al hacer clic fuera y al abrir otro", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T17:00:00") });
  await example(page);
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  const row = page.locator("[data-focus-id]").first();
  const priority = row.locator(".focus-priority");
  const actions = row.locator(".focus-remaining .focus-menu");
  await priority.locator("summary").click();
  await expect(priority).toHaveAttribute("open", "");
  await actions.locator("summary").click();
  await expect(priority).not.toHaveAttribute("open", "");
  await expect(actions).toHaveAttribute("open", "");
  await page.locator("#focus-content").click({ position: { x: 2, y: 2 } });
  await expect(actions).not.toHaveAttribute("open", "");
  await priority.locator("summary").click();
  await page.locator("#focus-content").click({ position: { x: 2, y: 2 } });
  await expect(priority).not.toHaveAttribute("open", "");
});

test("Plan se ordena solo al salir de su grilla, conserva empates y deja sin horario al final", async ({
  page,
}) => {
  await example(page);
  await cell(page, "blocks", 1, "Hora inicio").fill("20:00");
  await cell(page, "blocks", 2, "Hora inicio").focus();
  await expect(ref(page, 1)).toHaveValue("t1");
  await cell(page, "blocks", 2, "Hora inicio").fill("19:00");
  await cell(page, "blocks", 4, "Hora inicio").fill("");
  await expect(ref(page, 1)).toHaveValue("t1");
  await task(page, 1).click();
  await expect(task(page, 1)).toBeFocused();
  await expect(ref(page, 1)).toHaveValue("t2,t3");
  await expect(ref(page, 2)).toHaveValue("t5");
  await expect(ref(page, 3)).toHaveValue("t1");
  await expect(ref(page, 4)).toHaveValue("t4");
  await cell(page, "blocks", 1, "Hora inicio").fill("21:00");
  await cell(page, "blocks", 2, "Hora inicio").focus();
  await expect(ref(page, 1)).toHaveValue("t2,t3");
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await expect(page.locator("#nav-focus")).toHaveClass("active");
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(ref(page, 1)).toHaveValue("t5");
  await expect(ref(page, 3)).toHaveValue("t2,t3");
  await cell(page, "blocks", 1, "Hora inicio").fill("22");
  await task(page).click();
  await expect(ref(page, 3)).toHaveValue("t5");
  await expect(cell(page, "blocks", 3, "Hora inicio")).toHaveValue("22:00");
  await cell(page, "blocks", 3, "Hora inicio").fill("18:00");
  await cell(page, "blocks", 4, "Hora fin").focus();
  await page.keyboard.press("Tab");
  await expect(ref(page, 1)).toHaveValue("t5");
  await expect(page.locator("#saved")).toHaveText("Guardado");
  await page.reload();
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(ref(page, 1)).toHaveValue("t5");
});

test("rutas SPA, historial y transición direccional entre Foco Jornada Mes", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.routeSentinel = 42;
    window.routeAnimations = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.tagName === "MAIN") window.routeAnimations.push(frames);
      return original.call(this, frames, options);
    };
  });
  await page.getByRole("button", { name: "Jornada", exact: true }).click();
  await expect(page).toHaveURL(/#\/jornada$/);
  await page.getByRole("button", { name: "Mes", exact: true }).click();
  await expect(page).toHaveURL(/#\/mes$/);
  await page.goBack();
  await expect(page.locator("#nav-day")).toHaveClass("active");
  await page.goForward();
  await expect(page.locator("#nav-month")).toHaveClass("active");
  await page.getByRole("button", { name: "Foco", exact: true }).click();
  await expect(page).toHaveURL(/#\/foco$/);
  expect(await page.evaluate(() => window.routeSentinel)).toBe(42);
  await expect(page.locator("html")).toHaveAttribute("data-navigation", "back");
  const animations = await page.evaluate(() => ({
    old: getComputedStyle(
      document.documentElement,
      "::view-transition-old(page-content)",
    ).animationName,
    next: getComputedStyle(
      document.documentElement,
      "::view-transition-new(page-content)",
    ).animationName,
  }));
  expect(animations).toEqual({ old: "page-out-right", next: "page-in-left" });
  await page.goto("/#/mes");
  await expect(page.locator("#nav-month")).toHaveClass("active");
  await page.reload();
  await expect(page.locator("#nav-month")).toHaveClass("active");
});
