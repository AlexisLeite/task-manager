import { format, totals } from "./model.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Read-only aggregation. Dates are inclusive; minutes are unioned per day. */
export function buildHistory(data, { from = "", to = "" } = {}) {
  const result = {
    from,
    to,
    error: "",
    totalMinutes: 0,
    dayCount: 0,
    tasks: [],
    days: [],
  };
  if ((from && !validDate(from)) || (to && !validDate(to))) {
    result.error = "Ingresá fechas válidas.";
    return result;
  }
  if (from && to && from > to) {
    result.error = "La fecha Desde debe ser anterior o igual a Hasta.";
    return result;
  }

  const catalog = new Map(
    (data.tasks || []).map((task) => [task.id, task.name]),
  );
  // Definitions are editable; historical actual rows and the suggestion catalog
  // may still carry an earlier name. Use the latest plan definition globally,
  // even when the report is filtered to older dates.
  for (const [, day] of Object.entries(data.days || {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const task of day.plan?.tasks || []) {
      if (task.taskId && task.name?.trim()) catalog.set(task.taskId, task.name);
    }
  }
  const grouped = new Map();
  const dates = Object.entries(data.days || {})
    .filter(
      ([date, day]) =>
        validDate(date) &&
        day.actual &&
        (!from || date >= from) &&
        (!to || date <= to),
    )
    .sort(([a], [b]) => b.localeCompare(a));

  for (const [date, { actual }] of dates) {
    const dayMinutes = totals(actual).work;
    if (!dayMinutes) continue;
    result.totalMinutes += dayMinutes;
    const identities = new Map();
    for (const task of actual.tasks) {
      // Never merge distinct identities just because their names coincide.
      const id = task.taskId || `local:${date}:${task.id}`;
      if (!identities.has(id)) identities.set(id, []);
      identities.get(id).push(task);
    }
    const dayTasks = [];
    for (const [id, definitions] of identities) {
      // Multiple definitions/intervals of the same global task share one union.
      const minutes = totals({
        tasks: definitions,
        blocks: actual.blocks,
      }).work;
      if (!minutes) continue;
      const current = grouped.get(id) || {
        id,
        name: catalog.get(id) || definitions[0].name || definitions[0].code,
        minutes: 0,
        days: 0,
      };
      current.minutes += minutes;
      current.days++;
      grouped.set(id, current);
      dayTasks.push({ id, name: current.name, minutes });
    }
    result.days.push({ date, minutes: dayMinutes, tasks: dayTasks });
  }
  result.dayCount = result.days.length;
  result.tasks = [...grouped.values()].sort(
    (a, b) =>
      b.minutes - a.minutes ||
      a.name.localeCompare(b.name, "es") ||
      a.id.localeCompare(b.id),
  );
  return result;
}

function dailyChart(history) {
  const days = [...history.days].reverse();
  const ceiling = Math.max(60, ...days.map((day) => day.minutes));
  const bars = days
    .map(
      (day) =>
        `<div class="history-day-bar" data-history-day="${escapeHtml(day.date)}" data-minutes="${day.minutes}" title="${escapeHtml(day.date)}: ${format(day.minutes)} hs realizadas"><div class="history-day-column"><span class="history-day-value">${format(day.minutes)}</span><span class="history-day-fill" style="height:${(day.minutes / ceiling) * 62}px"></span></div><span>${escapeHtml(day.date.slice(8) + "/" + day.date.slice(5, 7))}</span></div>`,
    )
    .join("");
  return `<section class="history-chart" aria-labelledby="history-daily-heading"><h2 id="history-daily-heading">Horas realizadas por jornada</h2><div class="history-daily-scroll" tabindex="0" role="region" aria-label="Gráfica de jornadas, desplazamiento horizontal"><div id="history-daily-chart" role="img" aria-labelledby="history-daily-title history-daily-description" style="grid-template-columns:repeat(${days.length},minmax(48px,1fr))"><span class="visually-hidden" id="history-daily-title">Horas realizadas por jornada</span><span class="visually-hidden" id="history-daily-description">${days.length} jornadas en orden cronológico. Total ${format(history.totalMinutes)} horas, sin duplicar intervalos paralelos.</span>${bars}</div></div></section>`;
}

function taskChart(history) {
  const highest = history.tasks[0].minutes;
  const bars = history.tasks
    .map(
      (task) =>
        `<div class="history-task-bar" data-history-task-bar="${escapeHtml(task.id)}" data-minutes="${task.minutes}" title="${escapeHtml(task.name)}: ${format(task.minutes)} hs"><span class="history-task-label">${escapeHtml(task.name)}</span><span class="history-task-track"><span style="width:${(task.minutes / highest) * 100}%"></span></span><span class="history-task-value">${format(task.minutes)}</span></div>`,
    )
    .join("");
  return `<section class="history-chart" aria-labelledby="history-task-heading"><h2 id="history-task-heading">Distribución por tarea</h2><div id="history-task-chart" role="img" aria-labelledby="history-task-title history-task-description"><span class="visually-hidden" id="history-task-title">Distribución de horas realizadas por tarea</span><span class="visually-hidden" id="history-task-description">${history.tasks.length} tareas, de mayor a menor tiempo. Las tareas paralelas se muestran individualmente; su suma puede superar el tiempo total.</span>${bars}</div></section>`;
}

const searchText = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function historyMatches(name, query = "") {
  const text = searchText(name);
  const words = text.split(/[^a-z0-9]+/);
  return searchText(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => {
      if (text.includes(token)) return true;
      // Abbreviations retain the order of their letters within a word.
      if (
        token.length >= 3 &&
        words.some((word) => {
          let index = 0;
          for (const letter of word) if (letter === token[index]) index++;
          return index === token.length;
        })
      )
        return true;
      if (token.length < 3) return false;
      return words.some((word) => {
        const limit = token.length >= 6 ? 2 : 1;
        if (Math.abs(word.length - token.length) > limit) return false;
        let previous = Array.from({ length: word.length + 1 }, (_, i) => i);
        for (let i = 1; i <= token.length; i++) {
          const current = [i];
          for (let j = 1; j <= word.length; j++)
            current[j] = Math.min(
              current[j - 1] + 1,
              previous[j] + 1,
              previous[j - 1] + (token[i - 1] === word[j - 1] ? 0 : 1),
            );
          previous = current;
        }
        return previous[word.length] <= limit;
      });
    });
}

export function historyHtml(data, filters = {}) {
  const history = buildHistory(data, filters);
  return `<div class="history-view">
    <div class="history-header"><div class="history-totals"><span><b id="history-actual">${format(history.totalMinutes)} hs</b> realizadas</span><span><b id="history-days">${history.dayCount}</b> ${history.dayCount === 1 ? "jornada" : "jornadas"}</span></div><button id="history-filter-toggle" aria-expanded="${!!filters.showDates}" aria-controls="history-date-filters">Filtros${history.from || history.to ? " •" : ""}</button></div>
    <div id="history-date-filters" class="history-filters" ${filters.showDates ? "" : "hidden"}>
      <label for="history-from">Desde <input type="date" id="history-from" aria-label="Desde" value="${escapeHtml(history.from)}"></label>
      <label for="history-to">Hasta <input type="date" id="history-to" aria-label="Hasta" value="${escapeHtml(history.to)}"></label>
      <button id="history-clear">Todo el historial</button>
    </div>
    ${history.error ? `<p class="history-error" role="alert">${escapeHtml(history.error)}</p>` : ""}

    ${history.days.length ? `<div class="history-charts">${dailyChart(history)}${taskChart(history)}</div>` : ""}
    <div class="history-section-header"><h2>Tareas realizadas</h2><button id="history-search-toggle" aria-label="Buscar tareas realizadas" aria-expanded="${!!filters.searchOpen}" aria-controls="history-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></div>
    <input id="history-search" type="search" aria-label="Buscar tareas por nombre" placeholder="Buscar tareas…" value="${escapeHtml(filters.query || "")}" ${filters.searchOpen ? "" : "hidden"}>
    <p id="history-search-empty" class="empty" ${history.tasks.length && !history.tasks.some((task) => historyMatches(task.name, filters.query)) ? "" : "hidden"}>No hay tareas que coincidan con la búsqueda.</p>
    <table class="report" aria-label="Distribución de horas"><thead><tr><th>Tarea</th><th>Jornadas</th><th>Horas</th></tr></thead><tbody>${history.tasks.map((task) => `<tr data-history-task="${escapeHtml(task.id)}" ${historyMatches(task.name, filters.query) ? "" : "hidden"}><td>${escapeHtml(task.name)}</td><td>${task.days}</td><td>${format(task.minutes)} hs</td></tr>`).join("")}</tbody></table>
    ${!history.tasks.length && !history.error ? '<p class="empty">Sin trabajo realizado en este período.</p>' : ""}
    <h2>Jornadas trabajadas</h2><div class="day-list">${history.days.map((day) => `<button data-date="${escapeHtml(day.date)}"><span>${escapeHtml(day.date)}</span><span>Realizado: ${format(day.minutes)} hs</span></button>`).join("")}</div>
    <p class="footnote">El total cuenta una sola vez los intervalos en paralelo. Las horas de cada tarea se muestran por separado.</p></div>`;
}
