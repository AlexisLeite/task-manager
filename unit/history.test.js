import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHistory, historyHtml } from "../src/history.js";

const task = (id, taskId, name = taskId) => ({ id, taskId, name, code: id });
const block = (taskIds, start, end, extra = {}) => ({
  taskIds,
  start,
  end,
  ...extra,
});
const doc = (tasks, blocks) => ({ tasks, blocks });
const entry = (actual) => ({
  plan: doc([task("p", "planned")], [block(["p"], "00:00", "23:59")]),
  actual,
});

test("Historia incluye todas las fechas realizadas y nunca cuenta planificación", () => {
  const data = {
    tasks: [],
    days: {
      "2025-12-31": entry(
        doc([task("a", "global")], [block(["a"], "10:00", "11:00")]),
      ),
      "2026-10-15": entry(
        doc([task("b", "global")], [block(["b"], "10:00", "12:00")]),
      ),
      "2026-10-16": entry(null),
      "2026-10-17": entry(doc([], [])),
    },
  };
  const original = structuredClone(data);
  const report = buildHistory(data);
  assert.equal(report.totalMinutes, 180);
  assert.equal(report.dayCount, 2);
  assert.deepEqual(
    report.days.map((d) => d.date),
    ["2026-10-15", "2025-12-31"],
  );
  assert.deepEqual(report.tasks, [
    { id: "global", name: "global", minutes: 180, days: 2 },
  ]);
  assert.deepEqual(data, original);
});

test("identidad global une aliases y solapamientos sin duplicar paralelos", () => {
  const data = {
    tasks: [{ id: "global", name: "Nombre actual" }],
    days: {
      "2026-10-15": entry(
        doc(
          [
            task("a", "global", "Antes"),
            task("b", "global", "Alias"),
            task("c", "other", "Nombre actual"),
          ],
          [
            block(["a", "c"], "09:00", "11:00"),
            block(["b"], "10:00", "12:00"),
            block(["a"], "09:00", "11:00"),
          ],
        ),
      ),
      "2026-10-16": entry(
        doc([task("d", "global")], [block(["d"], "09:00", "10:00")]),
      ),
    },
  };
  const report = buildHistory(data);
  assert.equal(report.totalMinutes, 240);
  assert.deepEqual(report.tasks, [
    { id: "global", name: "Nombre actual", minutes: 240, days: 2 },
    { id: "other", name: "Nombre actual", minutes: 120, days: 1 },
  ]);
});

test("filtros desde/hasta son inclusivos e independientes", () => {
  const data = {
    days: Object.fromEntries(
      ["2026-01-31", "2026-02-01", "2026-02-02"].map((date) => [
        date,
        entry(doc([task("a", "global")], [block(["a"], "10:00", "11:00")])),
      ]),
    ),
  };
  assert.equal(
    buildHistory(data, { from: "2026-02-01", to: "2026-02-01" }).totalMinutes,
    60,
  );
  assert.equal(buildHistory(data, { from: "2026-02-01" }).dayCount, 2);
  assert.equal(buildHistory(data, { to: "2026-02-01" }).dayCount, 2);
  assert.equal(buildHistory(data, { from: "2027-01-01" }).totalMinutes, 0);
  assert.equal(
    buildHistory(data, { from: "2026-03-01", to: "2026-02-01" }).dayCount,
    0,
  );
  assert.match(
    buildHistory(data, { from: "2026-03-01", to: "2026-02-01" }).error,
    /Desde/,
  );
  assert.match(buildHistory(data, { from: "2026-02-30" }).error, /válidas/);
});

test("ignora intervalos inválidos, referencias sin resolver y jornadas sin tiempo realizado", () => {
  const report = buildHistory({
    days: {
      "2026-10-15": entry(
        doc(
          [task("a", "global")],
          [
            block(["a"], "25:00", "26:00"),
            block(["a"], "09:00", "08:00"),
            block(["a"], "09:00", "09:00"),
            block(["missing"], "10:00", "11:00"),
            block(["a"], "10:00", "11:00", { refsText: "unknown" }),
          ],
        ),
      ),
    },
  });
  assert.equal(report.totalMinutes, 0);
  assert.deepEqual(report.days, []);
  assert.deepEqual(report.tasks, []);
});

test("HTML respeta contrato de filtros y jornadas y escapa nombres e identidades", () => {
  const name = '<img src=x onerror="alert(1)">';
  const html = historyHtml(
    {
      days: {
        "2026-10-15": entry(
          doc(
            [task("a", 'id" onmouseover="x', name)],
            [block(["a"], "10:00", "11:00")],
          ),
        ),
      },
    },
    { from: "2026-10-15", to: "2026-10-15" },
  );
  for (const id of [
    "history-from",
    "history-to",
    "history-clear",
    "history-actual",
  ])
    assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('data-date="2026-10-15"'));
  assert.ok(html.includes('aria-label="Desde"'));
  assert.ok(html.includes('aria-label="Hasta"'));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes('id="history-actual">1:00 hs'));
  const invalid = historyHtml(
    { days: {} },
    { from: '" autofocus onfocus="alert(1)' },
  );
  assert.ok(invalid.includes('role="alert"'));
  assert.ok(!invalid.includes('value="" autofocus'));
});

test("sin identidad global no mezcla homónimos de jornadas distintas", () => {
  const report = buildHistory({
    days: {
      "2026-10-15": entry(
        doc([task("a", "", "Mismo nombre")], [block(["a"], "10:00", "11:00")]),
      ),
      "2026-10-16": entry(
        doc([task("a", "", "Mismo nombre")], [block(["a"], "10:00", "11:00")]),
      ),
    },
  });
  assert.equal(report.tasks.length, 2);
  assert.equal(report.totalMinutes, 120);
});

test("gráficas usan el mismo rango y minutos que el resumen, con fechas cronológicas y texto accesible", () => {
  const data = {
    days: {
      "2026-09-30": entry(
        doc([task("a", "same")], [block(["a"], "10:00", "11:00")]),
      ),
      "2026-10-01": entry(
        doc(
          [task("b", "same"), task("c", "parallel")],
          [block(["b", "c"], "10:00", "12:00")],
        ),
      ),
      "2026-10-02": entry(
        doc([task("d", "same")], [block(["d"], "10:00", "13:00")]),
      ),
    },
  };
  const html = historyHtml(data, { from: "2026-10-01", to: "2026-10-02" });
  assert.ok(html.includes('id="history-actual">5:00 hs'));
  assert.ok(html.includes('data-history-day="2026-10-01" data-minutes="120"'));
  assert.ok(html.includes('data-history-day="2026-10-02" data-minutes="180"'));
  assert.ok(!html.includes("2026-09-30"));
  assert.ok(
    html.indexOf('data-history-day="2026-10-01"') <
      html.indexOf('data-history-day="2026-10-02"'),
  );
  assert.ok(html.includes('data-history-task-bar="same" data-minutes="300"'));
  assert.ok(
    html.includes('data-history-task-bar="parallel" data-minutes="120"'),
  );
  assert.ok(
    html.includes(
      'aria-labelledby="history-daily-title history-daily-description"',
    ),
  );
  assert.ok(
    html.includes(
      'aria-labelledby="history-task-title history-task-description"',
    ),
  );
  assert.ok(!html.includes("NaN"));
});

test("sin datos o rango inválido no produce gráficas vacías ni escalas inválidas", () => {
  for (const filters of [{}, { from: "2026-10-31", to: "2026-10-01" }]) {
    const html = historyHtml({ days: {} }, filters);
    assert.ok(!html.includes("<svg"));
    assert.ok(!html.includes("NaN"));
    assert.ok(!html.includes("Infinity"));
  }
});

test("Historia refleja renombres de definiciones actuales aunque se filtre una jornada antigua", () => {
  const data = {
    tasks: [{ id: "rest", name: "Descanso media hora" }],
    days: {
      "2026-10-14": entry(
        doc(
          [task("a", "rest", "Descanso media hora")],
          [block(["a"], "10:00", "11:00")],
        ),
      ),
      "2026-10-15": {
        plan: doc([task("b", "rest", "Descanso")], []),
        actual: null,
      },
    },
  };
  const report = buildHistory(data, { from: "2026-10-14", to: "2026-10-14" });
  assert.deepEqual(report.tasks, [
    { id: "rest", name: "Descanso", minutes: 60, days: 1 },
  ]);
  const html = historyHtml(data, { from: "2026-10-14", to: "2026-10-14" });
  assert.ok(html.includes("Descanso"));
  assert.ok(!html.includes("Descanso media hora"));
});
