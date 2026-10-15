import autoAnimate from "@formkit/auto-animate";
import "./style.css";
import { Repository, LocalStorageAdapter, BackendAdapter } from "./storage.js";
import {
  uid,
  normalize,
  minutes,
  clock,
  duration,
  format,
  time,
  document as newDocument,
  block,
  task,
  nextCode,
  totals,
  resolved,
  references,
  registerTasks,
  example,
  migrate,
  validate,
  syncPlan,
  normalizeDocument,
  normalizePriority,
  parseTimeInput,
} from "./model.js";

const localMode = import.meta.env.VITE_STORAGE === "local";
const repo = new Repository(
  localMode ? new LocalStorageAdapter() : new BackendAdapter(),
);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fields = {
  tasks: ["code", "estimate", "priority", "name"],
  blocks: ["refs", "description", "start", "end"],
};
const labels = {
  tasks: ["Identificador", "Duración", "Prioridad", "Descripción"],
  blocks: ["Tarea", "Descripción", "Hora inicio", "Hora fin"],
};
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const viewRoutes = { focus: "foco", day: "jornada", month: "mes" };
const routeView = () =>
  Object.keys(viewRoutes).find(
    (key) => location.hash === `#/${viewRoutes[key]}`,
  ) || "focus";
let pageTransition;
let isRendering = false;
function navigate(next, push = true) {
  if (push && location.hash !== `#/${viewRoutes[next]}`)
    window.history.pushState(null, "", `#/${viewRoutes[next]}`);
  if (next === view) return;
  const order = ["focus", "day", "month"];
  document.documentElement.dataset.navigation =
    order.indexOf(next) > order.indexOf(view) ? "forward" : "back";
  pageTransition?.skipTransition();
  view = next;
  if (
    document.startViewTransition &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    pageTransition = document.startViewTransition(() => render());
  } else render();
}
window.addEventListener("popstate", () => {
  if (data) navigate(routeView(), false);
});
window.addEventListener("hashchange", () => {
  if (data) navigate(routeView(), false);
});
let data,
  date = today(),
  mode = "plan",
  view = routeView(),
  history = [],
  future = [],
  selection = { grid: null, indices: new Set(), anchor: 0 },
  suggestions = null,
  status = "Guardado",
  revision = 0,
  lastGrid = "tasks";
const day = () => (data.days[date] ||= { plan: newDocument(), actual: null });
const doc = () => day()[mode];
const rows = (grid) => doc()?.[grid] || [];
const isDark = () => document.documentElement.dataset.theme === "dark";
const notice = (message) => {
  const node = document.querySelector("#notice");
  if (node) node.textContent = message;
};
function checkpoint() {
  history.push(JSON.stringify(data));
  if (history.length > 150) history.shift();
  future = [];
}
function setStatus(value) {
  status = value;
  const node = document.querySelector("#saved");
  if (node) node.textContent = value;
}
async function save() {
  const rev = ++revision;
  setStatus("Guardando…");
  try {
    await repo.save(data);
    if (rev === revision) setStatus("Guardado");
  } catch (error) {
    setStatus("No se pudo guardar");
    notice(
      localMode
        ? "No se pudo guardar. Exportá una copia antes de cerrar."
        : `${error.message} Exportá una copia antes de cerrar.`,
    );
  }
}
function focusCell(grid, i, c = 0) {
  document
    .querySelector(`[data-grid="${grid}"][data-row="${i}"][data-col="${c}"]`)
    ?.focus();
}
function activeCell() {
  const el = document.activeElement;
  return el?.dataset.grid
    ? [el.dataset.grid, +el.dataset.row, +el.dataset.col]
    : null;
}
function clearSelection() {
  selection.indices.clear();
  document.querySelectorAll("tr.selected").forEach((tr) => {
    tr.classList.remove("selected");
    tr.setAttribute("aria-selected", "false");
  });
}
function select(grid, i, range = false) {
  if (range && selection.grid === grid) {
    selection.indices = new Set(
      Array.from(
        { length: Math.abs(i - selection.anchor) + 1 },
        (_, n) => Math.min(i, selection.anchor) + n,
      ),
    );
  } else {
    clearSelection();
    selection = { grid, indices: new Set([i]), anchor: i };
  }
  document
    .querySelectorAll(`table[data-table="${grid}"] tbody tr`)
    .forEach((tr, n) => {
      tr.classList.toggle("selected", selection.indices.has(n));
      tr.setAttribute("aria-selected", selection.indices.has(n));
    });
}
function commit(fn, focus) {
  checkpoint();
  fn();
  if (doc()) syncPlan(doc());
  if (mode === "actual" && doc()) registerTasks(data, doc());
  clearSelection();
  render();
  save();
  if (focus) focusCell(...focus);
}
function undo(redo = false) {
  const from = redo ? future : history,
    to = redo ? history : future;
  if (!from.length) return;
  const focus = activeCell();
  const editor = ["intro", "title"].includes(document.activeElement?.id)
    ? {
        id: document.activeElement.id,
        position: document.activeElement.selectionStart,
      }
    : null;
  to.push(JSON.stringify(data));
  data = JSON.parse(from.pop());
  clearSelection();
  render();
  save();
  if (focus) focusCell(...focus);
  if (editor) {
    const el = document.getElementById(editor.id);
    if (el) {
      el.focus();
      const position = Math.min(editor.position, el.value.length);
      el.setSelectionRange(position, position);
    }
  }
}
function add(grid) {
  if (grid === "blocks") {
    document.activeElement?.blur();
    grid = "tasks";
  }
  const i = rows(grid).length;
  commit(() => {
    if (grid === "tasks") doc().tasks.push(task(doc().tasks));
    else
      doc().blocks.push({ ...block(), start: doc().blocks.at(-1)?.end || "" });
  }, [grid, i, 0]);
}
function move(grid, from, to) {
  if (from === to) return;
  if (
    selection.grid === grid &&
    selection.indices.size > 1 &&
    selection.indices.has(from)
  ) {
    const indices = [...selection.indices].sort((a, b) => a - b),
      first = indices[0],
      count = indices.length;
    const at = Math.max(
      0,
      Math.min(rows(grid).length - count, first + (to > from ? 1 : -1)),
    );
    if (at === first) return;
    commit(() => {
      const picked = rows(grid).filter((_, i) => indices.includes(i));
      doc()[grid] = rows(grid).filter((_, i) => !indices.includes(i));
      rows(grid).splice(at, 0, ...picked);
    }, [grid, at + count - 1, 0]);
    select(grid, at);
    select(grid, at + count - 1, true);
    return;
  }
  commit(() => {
    const [r] = rows(grid).splice(from, 1);
    rows(grid).splice(to, 0, r);
  }, [grid, to, 0]);
}
function deleteRows() {
  if (!selection.indices.size) return;
  const grid = selection.grid,
    at = Math.min(...selection.indices);
  commit(() => {
    if (grid === "tasks") {
      const removed = new Set(
        doc()
          .tasks.filter((_, i) => selection.indices.has(i))
          .map((t) => t.id),
      );
      doc().blocks = doc()
        .blocks.map((b) => ({
          ...b,
          taskIds: b.taskIds.filter((id) => !removed.has(id)),
        }))
        .filter((b) => b.taskIds.length || b.refsText);
    }
    doc()[grid] = rows(grid).filter((_, i) => !selection.indices.has(i));
  });
  if (rows(grid).length) focusCell(grid, Math.min(at, rows(grid).length - 1));
  else document.querySelector(`#add-${grid}`)?.focus();
}
function chain() {
  const list = doc().blocks;
  let next = minutes(list[0]?.start);
  const sizes = list.map(duration);
  if (
    !clock(list[0]?.start) ||
    !list.length ||
    sizes.some((n) => !n) ||
    next + sizes.reduce((a, b) => a + b, 0) >= 1440
  ) {
    notice("Completá horarios válidos que quepan en el mismo día.");
    return;
  }
  commit(() =>
    list.forEach((b, i) => {
      b.start = time(next);
      next += sizes[i];
      b.end = time(next);
    }),
  );
}
function setReferences(b, value) {
  const codes = [
      ...new Set(
        value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    tasks = codes.map((code) => doc().tasks.find((t) => t.code === code));
  b.taskIds = tasks.filter(Boolean).map((t) => t.id);
  if (tasks.some((t) => !t)) b.refsText = value;
  else delete b.refsText;
}
function blockReferences(b) {
  return b.refsText ?? references(doc(), b);
}
function fillEnd(b) {
  if (b.end || !clock(b.start)) return;
  const n = Math.max(
    0,
    ...resolved(doc(), b).map((t) => minutes(t.estimate) || 0),
  );
  if (n && minutes(b.start) + n < 1440) b.end = time(minutes(b.start) + n);
}
function errorFor(grid, r) {
  if (grid === "tasks") {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(r.code) ||
      doc().tasks.filter((t) => t.code === r.code).length > 1
    )
      return "Identificador vacío, inválido o duplicado";
    if (r.estimate && !Number.isFinite(minutes(r.estimate)))
      return "Duración inválida: usá h:mm";
  } else {
    if (r.refsText) return "Referencia a tarea desconocida";
    if ((r.start || r.end) && !duration(r))
      return "Usá HH:mm, con fin posterior al inicio";
  }
  return "";
}
function updateView() {
  if (!doc()) return;
  for (const b of doc().blocks)
    b.description = resolved(doc(), b)
      .map((t) => t.name)
      .join(" / ");
  if (mode === "plan") deriveEnds(doc());
  document.querySelectorAll("[data-table] tbody tr").forEach((tr) => {
    const grid = tr.closest("table").dataset.table,
      r = rows(grid)[+tr.dataset.index],
      error = errorFor(grid, r);
    tr.classList.toggle("invalid", !!error);
    tr.title = error;
    tr.querySelectorAll("input").forEach((input) =>
      input.setAttribute("aria-invalid", !!error),
    );
  });
  document
    .querySelectorAll('[data-grid="blocks"][data-col="0"]')
    .forEach((el) => {
      if (el !== document.activeElement)
        el.value = blockReferences(doc().blocks[+el.dataset.row]);
    });
  document
    .querySelectorAll('[data-grid="blocks"][data-col="1"]')
    .forEach((el) => {
      if (el !== document.activeElement)
        el.value = doc().blocks[+el.dataset.row]?.description || "";
    });
  document.querySelectorAll(".priority-dots").forEach((el) => {
    el.innerHTML = priorityDots(doc().blocks[+el.dataset.block]);
  });
  document
    .querySelectorAll('[data-grid="blocks"][data-col="3"]')
    .forEach((el) => {
      if (el !== document.activeElement)
        el.value = doc().blocks[+el.dataset.row]?.end || "";
    });
  document
    .querySelectorAll('[data-grid="tasks"][data-col="1"]')
    .forEach((el) => {
      if (el !== document.activeElement)
        el.value = doc().tasks[+el.dataset.row]?.estimate || "";
    });
  const sum = totals({
    ...doc(),
    blocks: doc().blocks.filter((b) => !b.refsText),
  });
  const total = document.querySelector("#total");
  if (total)
    total.textContent = `${mode === "plan" ? "Planificado" : "Realizado"}: ${format(sum.work)} hs`;
  document.querySelector("#undo").disabled = !history.length;
  document.querySelector("#redo").disabled = !future.length;
}
function closeSuggestions() {
  if (suggestions) {
    suggestions.input.setAttribute("aria-expanded", "false");
    suggestions.input.removeAttribute("aria-activedescendant");
  }
  document.querySelector("#suggestions")?.remove();
  suggestions = null;
}
function showSuggestions(input) {
  closeSuggestions();
  const query = normalize(input.value);
  const matches = data.tasks
    .filter(
      (t) => normalize(t.name).includes(query) && normalize(t.name) !== query,
    )
    .slice(-8)
    .reverse();
  if (!matches.length) return;
  suggestions = { input, matches, index: -1 };
  const popup = document.createElement("div");
  popup.id = "suggestions";
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-label", "Tareas conocidas");
  const rect = input.getBoundingClientRect();
  Object.assign(popup.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.bottom}px`,
    width: `${Math.min(rect.width, innerWidth - rect.left - 12)}px`,
  });
  popup.innerHTML = matches
    .map(
      (t, i) =>
        `<div id="option-${i}" role="option" aria-selected="false" data-option="${i}">${esc(t.name)}</div>`,
    )
    .join("");
  popup.onmousedown = (e) => {
    const option = e.target.closest("[data-option]");
    if (option) {
      e.preventDefault();
      chooseSuggestion(+option.dataset.option);
    }
  };
  document.body.append(popup);
  input.setAttribute("aria-expanded", "true");
}
function chooseSuggestion(i) {
  const { input, matches } = suggestions,
    t = matches[i];
  if (!t) return;
  checkpoint();
  const r = doc().tasks[+input.dataset.row];
  r.name = t.name;
  r.taskId = t.id;
  input.value = t.name;
  closeSuggestions();
  save();
  updateView();
}
function toggleTheme() {
  const theme = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#191b1e" : "#fafaf8";
  const button = document.querySelector("#theme");
  button.textContent = theme === "dark" ? "☀ Claro" : "☾ Oscuro";
  button.setAttribute(
    "aria-label",
    theme === "dark" ? "Activar tema claro" : "Activar tema oscuro",
  );
  try {
    localStorage.setItem("jornada.theme", theme);
  } catch {
    notice("El tema cambió, pero no se pudo guardar la preferencia.");
  }
}
function deriveEnds(document) {
  for (const b of document.blocks) {
    const tasks = resolved(document, b),
      sizes = tasks.map((t) => minutes(t.estimate));
    const n = Math.max(0, ...sizes);
    b.end =
      clock(b.start) &&
      tasks.length &&
      sizes.every(Number.isFinite) &&
      n > 0 &&
      minutes(b.start) + n < 1440
        ? time(minutes(b.start) + n)
        : "";
  }
}
function priorityDots(b) {
  if (!b) return "";
  return resolved(doc(), b)
    .map(
      (t) =>
        `<span class="priority-dot ${t.priority.toLowerCase()}" role="img" aria-label="${esc(t.code)}: ${t.priority}" title="${esc(t.code)}: ${t.priority}"></span>`,
    )
    .join("");
}
function gridHtml(grid) {
  const isTask = grid === "tasks";
  return `<div class="grid-scroll"><table data-table="${grid}" aria-label="${isTask ? "Tareas para hoy" : "Plan de trabajo"}"><colgroup>${isTask ? '<col class="grip-col"><col class="code-col"><col class="estimate-col"><col class="priority-col"><col>' : '<col class="grip-col"><col class="refs-col"><col><col class="time-col"><col class="time-col">'}</colgroup><thead><tr><th></th>${(isTask ? ["Tarea", "Duración", "Prioridad", "Descripción"] : ["Tarea", "Descripción", "Hora inicio", "Hora fin"]).map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${rows(
    grid,
  )
    .map(
      (r, i) =>
        `<tr data-index="${i}" aria-selected="false"><td><button class="handle" draggable="true" data-handle="${grid}" data-index="${i}" aria-label="Seleccionar ${isTask ? "tarea" : "bloque"} ${i + 1}">⠿</button></td>${fields[
          grid
        ]
          .map((field, c) => {
            const value = field === "refs" ? blockReferences(r) : r[field],
              attrs = `data-grid="${grid}" data-row="${i}" data-col="${c}" aria-label="${isTask ? "Tarea" : "Plan"} ${i + 1}: ${labels[grid][c]}"`;
            if (field === "priority")
              return `<td><select ${attrs}>${["Baja", "Media", "Alta"].map((p) => `<option ${value === p ? "selected" : ""}>${p}</option>`).join("")}</select></td>`;
            const readonly =
              grid === "blocks" &&
              (field === "refs" || field === "description");
            return `<td class="${field === "start" || field === "end" ? "hours" : ""} ${field === "refs" ? "refs-cell" : ""}">${field === "refs" ? `<span class="priority-dots" data-block="${i}">${priorityDots(r)}</span>` : ""}<input autocomplete="off" ${attrs} value="${esc(value)}" ${readonly ? "readonly" : ""} ${["estimate", "start", "end"].includes(field) ? 'inputmode="numeric" maxlength="5" pattern="[0-9]{2}:[0-5][0-9]" placeholder="hh:mm"' : ""} ${isTask && field === "name" ? 'role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions"' : ""}>${field === "start" || field === "end" ? '<span class="unit" aria-hidden="true">hs</span>' : ""}</td>`;
          })
          .join("")}</tr>`,
    )
    .join(
      "",
    )}</tbody></table></div>${isTask ? '<button class="add" id="add-tasks">+ Tarea</button>' : ""}`;
}
function monthly() {
  const month = date.slice(0, 7),
    days = Object.entries(data.days)
      .filter(
        ([key, d]) =>
          key.startsWith(month) &&
          (d.plan.tasks.length || d.plan.blocks.length || d.actual),
      )
      .sort(([a], [b]) => a.localeCompare(b));
  const stats = new Map();
  let planned = 0,
    total = 0,
    count = 0;
  for (const [, d] of days) {
    planned += totals(d.plan).work;
    if (!d.actual) continue;
    count++;
    total += totals(d.actual).work;
    const identities = new Map();
    for (const t of d.actual.tasks) {
      const key = t.taskId || normalize(t.name);
      if (!identities.has(key)) identities.set(key, []);
      identities.get(key).push(t);
    }
    for (const [key, tasks] of identities) {
      const n = totals({ tasks, blocks: d.actual.blocks }).work;
      if (!n) continue;
      const s = stats.get(key) || { name: tasks[0].name, minutes: 0, days: 0 };
      s.minutes += n;
      s.days++;
      stats.set(key, s);
    }
  }
  return `<h1>Resumen mensual</h1><div class="month-totals"><span>Realizado: <b id="month-actual">${format(total)} hs</b></span><span>Planificado: <b>${format(planned)} hs</b></span><span>Jornadas reconciliadas: <b>${count}</b></span></div><h2>Tareas realizadas</h2><table class="report" aria-label="Distribución de horas"><thead><tr><th>Tarea</th><th>Jornadas</th><th>Horas</th></tr></thead><tbody>${[
    ...stats.values(),
  ]
    .sort((a, b) => b.minutes - a.minutes)
    .map(
      (s) =>
        `<tr><td>${esc(s.name)}</td><td>${s.days}</td><td>${format(s.minutes)} hs</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table>${stats.size ? "" : '<p class="empty">Sin tareas realizadas.</p>'}<h2>Jornadas</h2><div class="day-list">${days.map(([key, d]) => `<button data-date="${key}"><span>${key}</span><span>Plan: ${format(totals(d.plan).work)} hs</span><span>${d.actual ? `Realizado: ${format(totals(d.actual).work)} hs` : "Sin reconciliar"}</span></button>`).join("")}</div><p class="footnote">Las tareas paralelas conservan su duración individual; el total de jornada no duplica intervalos.</p>`;
}
function activeFocus() {
  const now = new Date();
  const current =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const plan = data.days[today()]?.plan;
  const active = new Map();
  for (const b of plan?.blocks || []) {
    if (!clock(b.start) || !clock(b.end) || b.refsText) continue;
    const start = minutes(b.start) * 60,
      end = minutes(b.end) * 60;
    if (start > current || end <= current) continue;
    for (const t of resolved(plan, b)) {
      if (b.focusStates?.[t.id]) continue;
      const previous = active.get(t.id);
      if (!previous || end > previous.end)
        active.set(t.id, {
          task: t,
          block: b,
          date: today(),
          start,
          end,
          current,
        });
    }
  }
  const order = plan?.focusOrder || [];
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  return [...active.values()].sort((a, b) => rank(a.task.id) - rank(b.task.id));
}
function upcomingFocus() {
  const now = new Date(),
    horizon = new Date(now.getTime() + 3 * 3600000);
  const result = [];
  for (const offset of [0, 1]) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + offset);
    const key = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
    const plan = data.days[key]?.plan;
    for (const b of plan?.blocks || []) {
      if (
        !clock(b.start) ||
        !clock(b.end) ||
        b.refsText ||
        minutes(b.end) <= minutes(b.start)
      )
        continue;
      const start = new Date(`${key}T${b.start}:00`);
      if (start <= now || start > horizon) continue;
      for (const t of resolved(plan, b)) {
        if (b.focusStates?.[t.id]) continue;
        result.push({
          block: b,
          date: key,
          task: t,
          start,
          label: b.start,
          key: `next-${key}-${b.id}-${t.id}`,
        });
      }
    }
  }
  return result.sort((a, b) => a.start - b.start);
}
function focusMenu(entry, pending = false) {
  return `<details class="focus-menu"><summary aria-label="Opciones de ${esc(entry.task.name || entry.task.code)}">⋮</summary><div><button data-focus-action="${pending ? "start" : "finish"}" data-action-date="${entry.date}" data-action-block="${esc(entry.block.id)}" data-action-task="${esc(entry.task.id)}">${pending ? "Iniciar tarea" : "Terminar tarea"}</button><button data-focus-action="cancel" data-action-date="${entry.date}" data-action-block="${esc(entry.block.id)}" data-action-task="${esc(entry.task.id)}">Cancelar tarea</button></div></details>`;
}
function actOnFocus(button) {
  const {
    focusAction: action,
    actionDate: key,
    actionBlock: blockId,
    actionTask: taskId,
  } = button.dataset;
  const source = data.days[key]?.plan;
  const b = source?.blocks.find((b) => b.id === blockId),
    t = source?.tasks.find((t) => t.id === taskId);
  if (!b || !t || b.focusStates?.[taskId]) return;
  const now = new Date(),
    nowMinutes = now.getHours() * 60 + now.getMinutes(),
    nowTime = time(nowMinutes);
  const pending = upcomingFocus().some(
    (e) => e.date === key && e.block.id === blockId && e.task.id === taskId,
  );
  const running = activeFocus().some(
    (e) => e.date === key && e.block.id === blockId && e.task.id === taskId,
  );
  if (
    (action === "start" && !pending) ||
    (action === "finish" && !running) ||
    (action === "cancel" && !pending && !running)
  )
    return;
  checkpoint();
  if (action === "finish") {
    const d = data.days[key];
    const actual = (d.actual ||= newDocument());
    let performed = actual.tasks.find((item) => item.id === t.id);
    if (!performed) {
      performed = structuredClone(t);
      actual.tasks.push(performed);
    }
    // Replace this occurrence if reconciliation was already copied from the plan.
    for (const row of actual.blocks)
      if (row.id === b.id || row.sourceFocus === `${blockId}/${taskId}`)
        row.taskIds = row.taskIds.filter((id) => id !== performed.id);
    actual.blocks = actual.blocks.filter((row) => row.taskIds.length);
    performed.estimate = time(Math.max(0, nowMinutes - minutes(b.start)));
    actual.blocks.push({
      ...block(),
      taskIds: [performed.id],
      start: b.start,
      end: nowTime,
      sourceFocus: `${blockId}/${taskId}`,
      description: performed.name,
      intentionalRepeat: true,
    });
    syncPlan(actual);
    registerTasks(data, actual);
    (b.focusStates ||= {})[taskId] = "finished";
  } else if (action === "cancel") {
    (b.focusStates ||= {})[taskId] = "cancelled";
  } else {
    const d = (data.days[today()] ||= { plan: newDocument(), actual: null });
    let target = d.plan.tasks.find((item) => item.id === t.id);
    if (!target) {
      target = structuredClone(t);
      d.plan.tasks.push(target);
    }
    const length = minutes(t.estimate) || minutes(b.end) - minutes(b.start);
    if (key === today() && b.taskIds.length === 1) {
      b.start = nowTime;
      b.end = time(Math.min(1439, nowMinutes + length));
    } else {
      (b.focusStates ||= {})[taskId] = "started";
      d.plan.blocks.push({
        ...block(),
        taskIds: [target.id],
        start: nowTime,
        end: time(Math.min(1439, nowMinutes + length)),
        description: target.name,
        intentionalRepeat: true,
      });
    }
  }
  button.closest("details").open = false;
  refreshFocus();
  document.querySelector("#focus-content summary")?.focus();
  save();
}
function focusHtml() {
  const active = activeFocus();
  const upcoming = upcomingFocus();
  return `<ul class="focus-list">${active
    .map((entry, i) => {
      const t = entry.task;
      return `<li data-entry-key="${esc(entry.task.id)}" data-focus-id="${esc(t.id)}" data-focus-drag draggable="true" tabindex="0" class="focus-card">
      <div class="focus-title"><details class="focus-menu focus-priority"><summary aria-label="Prioridad de ${esc(t.name || t.code)}"><span class="priority-dot ${normalizePriority(t.priority).toLowerCase()}" aria-hidden="true"></span></summary><div>${["Baja", "Media", "Alta"].map((p) => `<button data-focus-priority="${p}" aria-pressed="${p === normalizePriority(t.priority)}"><span class="priority-dot ${p.toLowerCase()}" aria-hidden="true"></span> ${p}</button>`).join("")}</div></details><h2>${esc(t.name || t.code)}</h2></div><div class="focus-remaining"><time aria-label="Tiempo restante"></time>${focusMenu(entry)}</div><div class="focus-progress" role="progressbar" aria-label="Tiempo restante de ${esc(t.name || t.code)}" aria-valuemin="0" aria-valuemax="100"><div></div></div>
    </li>`;
    })
    .join("")}${upcoming
    .map((entry) => {
      const { task: t, label, key } = entry;
      return `<li class="focus-card focus-upcoming" data-entry-key="${esc(key)}"><h2>${esc(t.name || t.code)}</h2><div class="focus-remaining"><time aria-label="Horario previsto">${esc(label)} - ${esc(entry.block.end)}</time>${focusMenu(entry, true)}</div></li>`;
    })
    .join(
      "",
    )}${!active.length && !upcoming.length ? '<li data-entry-key="empty" class="focus-empty">No hay actividades planificadas para este momento.</li>' : ""}</ul>`;
}
function refreshFocus() {
  const node = document.getElementById("focus-content");
  if (!node) return;
  const active = activeFocus();
  const list = node.querySelector(".focus-list");
  const template = document.createElement("template");
  template.innerHTML = focusHtml();
  const desired = [...template.content.querySelector(".focus-list").children];
  const existing = new Map(
    [...list.children]
      .filter((el) => el.dataset.entryKey)
      .map((el) => [el.dataset.entryKey, el]),
  );
  const keys = new Set(desired.map((el) => el.dataset.entryKey));
  for (const [key, el] of existing)
    if (!keys.has(key)) {
      delete el.dataset.entryKey;
      delete el.dataset.focusId;
      el.setAttribute("aria-hidden", "true");
      el.remove();
    }
  let previous = null;
  for (const fresh of desired) {
    const el = existing.get(fresh.dataset.entryKey) || fresh;
    if (el !== fresh) {
      for (const selector of ["h2", ".focus-upcoming time"]) {
        const current = el.querySelector(selector);
        const incoming = fresh.querySelector(selector);
        if (current && incoming && current.textContent !== incoming.textContent)
          current.textContent = incoming.textContent;
      }
      for (const [selector, attribute] of [
        ["summary", "aria-label"],
        [".focus-priority summary .priority-dot", "class"],
        ["[data-focus-priority]", "aria-pressed"],
        ["[role='progressbar']", "aria-label"],
      ]) {
        const incoming = fresh.querySelectorAll(selector);
        el.querySelectorAll(selector).forEach((element, index) => {
          const value = incoming[index]?.getAttribute(attribute);
          if (
            value !== null &&
            value !== undefined &&
            element.getAttribute(attribute) !== value
          )
            element.setAttribute(attribute, value);
        });
      }
    }
    const next = previous
      ? previous.nextElementSibling
      : list.firstElementChild;
    if (next !== el) list.insertBefore(el, next);
    previous = el;
  }
  node.querySelectorAll("[data-focus-id]").forEach((el, i) => {
    const { start, end, current } = active[i],
      remaining = end - current;
    el.querySelector("time").textContent = [
      Math.floor(remaining / 3600),
      Math.floor(remaining / 60) % 60,
      remaining % 60,
    ]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
    const percent = (remaining / (end - start)) * 100,
      progress = el.querySelector('[role="progressbar"]');
    progress.setAttribute("aria-valuenow", percent.toFixed(2));
    progress.firstElementChild.style.width = `${percent}%`;
  });
}
function reorderFocus(id, target) {
  const order = activeFocus().map((a) => a.task.id),
    from = order.indexOf(id);
  if (from < 0 || target < 0 || target >= order.length || from === target)
    return;
  checkpoint();
  order.splice(target, 0, order.splice(from, 1)[0]);
  const plan = data.days[today()].plan;
  plan.focusOrder = [
    ...order,
    ...(plan.focusOrder || []).filter((id) => !order.includes(id)),
  ];
  const node = document.getElementById("focus-content");
  refreshFocus();
  [...node.querySelectorAll("[data-focus-id]")]
    .find((el) => el.dataset.focusId === id)
    ?.focus();
  save();
}
function bindFocus() {
  const node = document.getElementById("focus-content");
  if (!node) return;
  autoAnimate(node.querySelector(".focus-list"), { duration: 250 });
  refreshFocus();
  node.onclick = (e) => {
    const priority = e.target.closest("[data-focus-priority]");
    if (priority) {
      const menu = priority.closest("details");
      const id = priority.closest("[data-focus-id]").dataset.focusId;
      const t = data.days[today()].plan.tasks.find((t) => t.id === id);
      checkpoint();
      t.priority = normalizePriority(priority.dataset.focusPriority);
      menu.querySelector(".priority-dot").className =
        `priority-dot ${t.priority.toLowerCase()}`;
      menu
        .querySelectorAll("button")
        .forEach((button) =>
          button.setAttribute(
            "aria-pressed",
            button.dataset.focusPriority === t.priority,
          ),
        );
      menu.open = false;
      menu.querySelector("summary").focus();
      save();
      return;
    }
    const action = e.target.closest("[data-focus-action]");
    if (action) {
      actOnFocus(action);
      return;
    }
  };
  node.onkeydown = (e) => {
    if (e.key === "Escape") {
      const menu = e.target.closest(".focus-menu");
      if (menu) {
        menu.open = false;
        menu.querySelector("summary").focus();
      }
    }
    if (!e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
    const card = e.target.closest("[data-focus-id]");
    if (!card) return;
    e.preventDefault();
    reorderFocus(
      card.dataset.focusId,
      activeFocus().findIndex((a) => a.task.id === card.dataset.focusId) +
        (e.key === "ArrowUp" ? -1 : 1),
    );
  };
  let dragged;
  node.ondragstart = (e) => {
    if (e.target.closest("select, button, summary, details")) {
      e.preventDefault();
      return;
    }
    const handle = e.target.closest("[data-focus-drag]");
    if (!handle) return;
    dragged = handle.closest("[data-focus-id]").dataset.focusId;
    e.dataTransfer.setData("text/plain", dragged);
    e.dataTransfer.effectAllowed = "move";
  };
  node.ondragover = (e) => {
    if (dragged && e.target.closest("[data-focus-id]")) e.preventDefault();
  };
  node.ondrop = (e) => {
    const card = e.target.closest("[data-focus-id]");
    if (!dragged || !card) return;
    e.preventDefault();
    reorderFocus(
      dragged,
      activeFocus().findIndex((a) => a.task.id === card.dataset.focusId),
    );
    dragged = null;
  };
  node.ondragend = () => {
    dragged = null;
  };
}
let polling = false;
const editing = () =>
  document.activeElement?.matches(
    "input, textarea, select, [contenteditable='true']",
  );
async function pollWorkspace() {
  if (!data) return;
  refreshFocus();
  if (polling || status !== "Guardado" || editing()) return;
  polling = true;
  const startedRevision = revision;
  try {
    const update = await repo.adapter.poll();
    if (
      !update ||
      revision !== startedRevision ||
      status !== "Guardado" ||
      editing()
    )
      return;
    const incoming = prepareData(update.data);
    data = incoming;
    repo.adapter.revision = update.revision;
    history = [];
    future = [];
    clearSelection();
    if (view === "focus") refreshFocus();
    else render();
  } catch {
    // Keep the current document and retry on the next tick, including after reconnecting.
  } finally {
    polling = false;
  }
}
setInterval(pollWorkspace, 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pollWorkspace();
});
document.addEventListener("click", (e) => {
  document.querySelectorAll(".focus-menu[open]").forEach((menu) => {
    if (!menu.contains(e.target)) menu.open = false;
  });
});

function render() {
  isRendering = true;
  closeSuggestions();
  clearSelection();
  const d = day();
  if (doc()) {
    syncPlan(doc());
    if (mode === "plan") deriveEnds(doc());
  }
  document.querySelector("#app").innerHTML =
    `<header class="toolbar"><nav><button id="nav-focus" class="${view === "focus" ? "active" : ""}">Foco</button><button id="nav-day" class="${view === "day" ? "active" : ""}">Jornada</button><button id="nav-month" class="${view === "month" ? "active" : ""}">Mes</button></nav><div class="dates" ${view === "focus" ? "hidden" : ""}><button id="prev" aria-label="Día anterior">←</button><input type="date" id="date" aria-label="Fecha de jornada" value="${date}"><button id="next" aria-label="Día siguiente">→</button><button id="today">Hoy</button></div><div class="settings"><span role="status" id="saved" hidden>${status}</span><button id="theme" aria-label="Activar tema ${isDark() ? "claro" : "oscuro"}">${isDark() ? "☀ Claro" : "☾ Oscuro"}</button><details class="file-menu"><summary aria-label="Copias de seguridad">⋯</summary><div><button id="export">Exportar copia</button><label class="import">Importar copia<input type="file" id="import" accept="application/json"></label></div></details></div></header><main>${view === "day" ? `<div class="document-tools"><div class="tabs"><button id="plan" class="${mode === "plan" ? "active" : ""}">Planificación</button><button id="actual" class="${mode === "actual" ? "active" : ""}">Realizado</button></div><div><button id="undo" aria-label="Deshacer" ${history.length ? "" : "disabled"}>↶</button><button id="redo" aria-label="Rehacer" ${future.length ? "" : "disabled"}>↷</button></div></div>${mode === "actual" && !d.actual ? '<h1>Realizado</h1><button id="reconcile">Comenzar reconciliación desde el plan</button>' : `<section><h2>Tareas para hoy:</h2>${gridHtml("tasks")}</section><section><div class="section-title"><h2>Plan de trabajo:</h2><button id="chain">Encadenar horarios</button></div>${gridHtml("blocks")}</section><div class="document-footer"><span id="total"></span>${!doc().tasks.length && !doc().blocks.length ? '<button id="example">Cargar ejemplo</button>' : ""}</div>`}` : view === "focus" ? `<section id="focus-content" aria-label="Actividades actuales">${focusHtml()}</section>` : monthly()}<p id="notice" role="status" aria-live="polite"></p></main>`;
  bind();
  if (view === "day" && doc()) updateView();
  isRendering = false;
}

function bind() {
  bindFocus();
  if (view === "day" && doc() && (doc().tasks.length || doc().blocks.length)) {
    const button = document.createElement("button");
    button.id = "example";
    button.textContent = "Cargar ejemplo";
    document.querySelector(".file-menu>div").append(button);
  }
  const on = (id, fn) =>
    document.getElementById(id)?.addEventListener("click", fn);
  const changeDate = (value) => {
    date = value;
    clearSelection();
    render();
  };
  on("nav-day", () => navigate("day"));
  on("nav-focus", () => navigate("focus"));
  on("nav-month", () => navigate("month"));
  on("theme", toggleTheme);
  document.querySelector("#date").onchange = (e) => {
    if (e.target.value) changeDate(e.target.value);
  };
  const shift = (n) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    changeDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  };
  on("prev", () => shift(-1));
  on("next", () => shift(1));
  on("today", () => changeDate(today()));
  on("plan", () => {
    mode = "plan";
    clearSelection();
    render();
  });
  on("actual", () => {
    mode = "actual";
    clearSelection();
    render();
  });
  on("reconcile", () =>
    commit(() => {
      day().actual = structuredClone(day().plan);
    }),
  );
  on("example", () => {
    if (
      (doc().tasks.length || doc().blocks.length) &&
      !confirm("¿Reemplazar este documento por el ejemplo? Podés deshacer.")
    )
      return;
    commit(() => {
      day()[mode] = example();
    });
  });
  on("add-tasks", () => add("tasks"));
  on("add-blocks", () => add("blocks"));
  on("chain", chain);
  on("undo", () => undo());
  on("redo", () => undo(true));
  for (const id of ["title", "intro"]) {
    const el = document.getElementById(id);
    if (el) el.onfocus = clearSelection;
    if (el)
      el.oninput = () => {
        checkpoint();
        doc()[id] = el.value;
        save();
        updateView();
      };
  }
  document.querySelectorAll("[data-date]").forEach(
    (el) =>
      (el.onclick = () => {
        date = el.dataset.date;
        mode = day().actual ? "actual" : "plan";
        navigate("day");
      }),
  );
  bindGrids();
  on("export", () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `jornada-${date}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.querySelector("#import").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = migrate(JSON.parse(await file.text()));
      validate(parsed);
      parsed.syncRevision = 1;
      for (const d of Object.values(parsed.days)) {
        normalizeDocument(d.plan);
        deriveEnds(d.plan);
        if (d.actual) normalizeDocument(d.actual);
      }
      if (
        !confirm("¿Reemplazar las jornadas por esta copia? Se puede deshacer.")
      )
        return;
      commit(() => {
        data = parsed;
      });
      notice("Copia importada.");
    } catch {
      notice("No se pudo importar: formato inválido.");
    }
  };
}
function bindGrids() {
  document.querySelectorAll("[data-grid]").forEach((el) => {
    const grid = el.dataset.grid,
      i = +el.dataset.row,
      c = +el.dataset.col,
      field = fields[grid][c];
    el.onfocus = () => {
      lastGrid = grid;
      clearSelection();
    };
    el.closest("td").onmousedown = (event) => {
      if (event.button !== 0) return;
      if (event.shiftKey) {
        event.preventDefault();
        closeSuggestions();
        select(grid, i, true);
      } else {
        clearSelection();
        selection.grid = grid;
        selection.anchor = i;
      }
    };
    let previousDraft = el.value;
    const timed = ["estimate", "start", "end"].includes(field);
    const finishTime = () => {
      const value = parseTimeInput(el.value, field !== "estimate");
      if (value !== null) applyTimeEdit(grid, i, field, value);
      el.value = rows(grid)[i]?.[field] || "";
      previousDraft = el.value;
    };
    el.onblur = () => {
      closeSuggestions();
      if (timed) finishTime();
    };
    el.oninput = () => {
      if (timed) {
        const raw = el.value;
        if (
          !/^[0-9:]*$/.test(raw) ||
          raw.length > 5 ||
          raw.split(":").length > 2
        ) {
          el.value = previousDraft;
          return;
        }
        const complete =
          raw === "" || /^\d{1,2}:\d{2}$/.test(raw) || /^\d{4}$/.test(raw);
        if (complete) {
          const value = parseTimeInput(raw, field !== "estimate");
          if (value === null || !applyTimeEdit(grid, i, field, value)) {
            el.value = previousDraft;
            return;
          }
          el.value = value;
        }
        previousDraft = el.value;
        return;
      }
      checkpoint();
      const r = rows(grid)[i];
      if (field === "refs") setReferences(r, el.value);
      else r[field] = el.value;
      if (field === "name") {
        r.taskId =
          data.tasks.find((t) => normalize(t.name) === normalize(el.value))
            ?.id || r.taskId;
        showSuggestions(el);
      }
      updateView();
      save();
    };
    el.onchange = () => {
      if (timed) {
        finishTime();
        return;
      }
      if (mode === "actual") registerTasks(data, doc());
      updateView();
      save();
    };
    el.onkeydown = gridKey;
  });
  let dragging = null;
  document.querySelectorAll("[data-handle]").forEach((el) => {
    const grid = el.dataset.handle,
      i = +el.dataset.index;
    el.onclick = (e) => select(grid, i, e.shiftKey);
    el.onkeydown = (e) => {
      if (["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const n = Math.max(
          0,
          Math.min(rows(grid).length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
        );
        if (e.altKey) move(grid, i, n);
        else {
          document
            .querySelector(`[data-handle="${grid}"][data-index="${n}"]`)
            ?.focus();
          select(grid, n, e.shiftKey);
        }
      }
    };
    el.ondragstart = (e) => {
      dragging = { grid, i };
      e.dataTransfer.setData("text/plain", String(i));
      e.dataTransfer.effectAllowed = "move";
    };
  });
  document.querySelectorAll("[data-table] tbody tr").forEach((el) => {
    el.ondragover = (e) => {
      if (dragging?.grid === el.closest("table").dataset.table)
        e.preventDefault();
    };
    el.ondrop = (e) => {
      e.preventDefault();
      if (dragging?.grid === el.closest("table").dataset.table)
        move(dragging.grid, dragging.i, +el.dataset.index);
      dragging = null;
    };
  });
  const planTable = document.querySelector('[data-table="blocks"]');
  if (planTable)
    planTable.addEventListener("focusout", (event) => {
      if (
        isRendering ||
        !planTable.isConnected ||
        planTable.contains(event.relatedTarget)
      )
        return;
      const current = doc();
      const sorted = [...current.blocks].sort((a, b) => {
        const left = clock(a.start) ? minutes(a.start) : Infinity;
        const right = clock(b.start) ? minutes(b.start) : Infinity;
        return left === right ? 0 : left - right;
      });
      if (sorted.every((row, i) => row === current.blocks[i])) return;
      checkpoint();
      current.blocks = sorted;
      clearSelection();
      planTable.parentElement.outerHTML = gridHtml("blocks");
      bindGrids();
      save();
    });
}
function applyTimeEdit(grid, index, field, value) {
  const r = rows(grid)[index];
  if (!r) return false;
  if (
    field === "end" &&
    value &&
    (!clock(r.start) || minutes(value) <= minutes(r.start))
  ) {
    notice("El fin debe ser posterior al inicio.");
    return false;
  }
  if (r[field] === value) return true;
  checkpoint();
  r[field] = value;
  if (field === "end")
    for (const t of resolved(doc(), r))
      t.estimate = value ? time(minutes(value) - minutes(r.start)) : "";
  if (field === "start" && !value) r.end = "";
  deriveEnds(doc());
  if (mode === "actual") registerTasks(data, doc());
  updateView();
  save();
  return true;
}
function gridKey(e) {
  const grid = e.target.dataset.grid,
    i = +e.target.dataset.row,
    c = +e.target.dataset.col;
  if (suggestions?.input === e.target && !e.altKey && !e.shiftKey) {
    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const s = suggestions;
      s.index =
        (s.index + (e.key === "ArrowDown" ? 1 : -1) + s.matches.length) %
        s.matches.length;
      document
        .querySelectorAll('#suggestions [role="option"]')
        .forEach((el, j) => el.setAttribute("aria-selected", j === s.index));
      e.target.setAttribute("aria-activedescendant", `option-${s.index}`);
      return;
    }
    if (e.key === "Enter" && suggestions.index >= 0) {
      e.preventDefault();
      chooseSuggestion(suggestions.index);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeSuggestions();
      return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") clearSelection();
  if (e.shiftKey && e.code === "Space") {
    e.preventDefault();
    select(grid, i);
    return;
  }
  if (["Home", "End"].includes(e.key) && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const column = e.key === "Home" ? 0 : 3;
    focusCell(grid, i, column);
    const input = document.activeElement,
      position = e.key === "Home" ? 0 : input.value.length;
    input.setSelectionRange(position, position);
    if (e.shiftKey) select(grid, i);
    return;
  }
  if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    move(
      grid,
      i,
      Math.max(
        0,
        Math.min(rows(grid).length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
      ),
    );
    return;
  }
  if (e.shiftKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    if (!selection.indices.size || selection.grid !== grid) select(grid, i);
    const n = Math.max(
      0,
      Math.min(rows(grid).length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
    );
    focusCell(grid, n, c);
    select(grid, n, true);
    return;
  }
  if (["ArrowUp", "ArrowDown"].includes(e.key) && !e.shiftKey) {
    if (e.target.tagName === "SELECT") return;
    e.preventDefault();
    focusCell(
      grid,
      Math.max(
        0,
        Math.min(rows(grid).length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
      ),
      c,
    );
    return;
  }
  if (
    !e.shiftKey &&
    ((e.key === "ArrowLeft" && e.target.selectionStart === 0) ||
      (e.key === "ArrowRight" &&
        e.target.selectionStart === e.target.value.length))
  ) {
    e.preventDefault();
    focusCell(
      grid,
      i,
      Math.max(0, Math.min(3, c + (e.key === "ArrowRight" ? 1 : -1))),
    );
  }
  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
    if (e.target.tagName === "SELECT") return;
    e.preventDefault();
    if (i === rows(grid).length - 1) add(grid);
    else focusCell(grid, i + 1, c);
  }
  if (e.key === "Tab") {
    const next = i * 4 + c + (e.shiftKey ? -1 : 1);
    if (next < 0) return;
    e.preventDefault();
    if (next >= rows(grid).length * 4) add(grid);
    else focusCell(grid, Math.floor(next / 4), next % 4);
  }
}
function importDefinitions(incoming) {
  const mapping = new Map();
  for (const source of incoming) {
    let t =
      doc().tasks.find((t) => t.id === source.id) ||
      doc().tasks.find(
        (t) =>
          t.taskId === source.taskId &&
          normalize(t.name) === normalize(source.name),
      );
    if (!t) {
      t = {
        ...source,
        id: uid(),
        code: doc().tasks.some((t) => t.code === source.code)
          ? nextCode(doc().tasks)
          : source.code,
      };
      doc().tasks.push(t);
    }
    mapping.set(source.id, t.id);
  }
  return mapping;
}
document.addEventListener("keydown", (e) => {
  if (view !== "day") return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo(e.shiftKey);
  }
  if (mod && e.key.toLowerCase() === "y") {
    e.preventDefault();
    undo(true);
  }
  if (mod && e.key === "Enter" && doc()) {
    e.preventDefault();
    add(e.target.dataset.grid || lastGrid);
  }
  if (selection.indices.size && ["Delete", "Backspace"].includes(e.key)) {
    e.preventDefault();
    deleteRows();
  }
  if (e.key === "Escape") {
    closeSuggestions();
    clearSelection();
  }
});
for (const type of ["copy", "cut"])
  document.addEventListener(type, (e) => {
    if (view !== "day" || !selection.indices.size) return;
    e.preventDefault();
    const grid = selection.grid,
      picked = rows(grid).filter((_, i) => selection.indices.has(i));
    e.clipboardData.setData(
      "application/x-jornada",
      JSON.stringify({
        grid,
        rows: picked,
        tasks: doc().tasks,
        cut: type === "cut",
        sourceDate: date,
        sourceMode: mode,
        blocks: doc()
          .blocks.map((b, index) => ({ block: b, index }))
          .filter(({ block: b }) =>
            picked.some((t) => b.taskIds.includes(t.id)),
          ),
      }),
    );
    e.clipboardData.setData(
      "text/plain",
      picked
        .map((r) =>
          fields[grid]
            .map((field) =>
              (field === "refs" ? blockReferences(r) : r[field]).replace(
                /[\t\r\n]/g,
                " ",
              ),
            )
            .join("\t"),
        )
        .join("\n"),
    );
    if (type === "cut") deleteRows();
  });
document.addEventListener("paste", (e) => {
  if (view !== "day" || !doc()) return;
  const raw = e.clipboardData.getData("application/x-jornada"),
    text = e.clipboardData.getData("text/plain");
  if (!raw && !text.includes("\t") && !text.includes("\n")) return;
  if (e.target.id === "intro" || e.target.id === "title") return;
  const grid = e.target.dataset.grid || selection.grid || lastGrid;
  if (
    !e.target.closest("table") &&
    rows(grid).length &&
    !selection.indices.size
  )
    return;
  let parsed;
  try {
    if (raw) parsed = JSON.parse(raw);
  } catch {
    return;
  }
  e.preventDefault();
  const at =
    selection.indices.size && selection.grid === grid
      ? Math.min(...selection.indices)
      : Number(e.target.dataset.row ?? rows(grid).length) +
        (e.target.dataset.col === "3" &&
        e.target.value?.length &&
        e.target.selectionStart === e.target.value.length
          ? 1
          : 0);
  commit(() => {
    let incoming = [];
    if (parsed?.grid === "blocks" && grid === "blocks") {
      const ids = new Set(parsed.rows.flatMap((b) => b.taskIds)),
        mapping = importDefinitions(parsed.tasks.filter((t) => ids.has(t.id)));
      incoming = parsed.rows.map((b) => ({
        ...b,
        id: uid(),
        intentionalRepeat: !parsed.cut,
        taskIds: b.taskIds.map((id) => mapping.get(id)),
      }));
    } else if (parsed?.grid === "tasks" && grid === "tasks") {
      incoming = parsed.rows.map((source) => {
        const keepId =
          parsed.cut &&
          parsed.sourceDate === date &&
          parsed.sourceMode === mode &&
          !doc().tasks.some((t) => t.id === source.id);
        const t = {
          ...source,
          id: keepId ? source.id : uid(),
          code: source.code,
        };
        if (
          [...doc().tasks, ...incoming].some((other) => other.code === t.code)
        )
          t.code = nextCode([...doc().tasks, ...incoming]);
        incoming.push(t);
        return t;
      });
    } else if (parsed?.grid === "tasks" && grid === "blocks") {
      const mapping = importDefinitions(parsed.rows);
      incoming = parsed.rows.map((t) => ({
        ...block(),
        taskIds: [mapping.get(t.id)],
        description: t.name,
      }));
    } else {
      incoming = text
        .trimEnd()
        .split(/\r?\n/)
        .map((line) => {
          const values = line.split("\t"),
            r =
              grid === "tasks" ? task([...doc().tasks, ...incoming]) : block();
          fields[grid].forEach((field, i) => {
            if (values[i] === undefined) return;
            if (field === "refs") setReferences(r, values[i]);
            else
              r[field] = values[i].replace(
                ["estimate", "start", "end"].includes(field)
                  ? /\s*hs?\s*$/i
                  : /$^/,
                "",
              );
          });
          if (
            grid === "tasks" &&
            [...doc().tasks, ...incoming].some((t) => t.code === r.code)
          )
            r.code = nextCode([...doc().tasks, ...incoming]);
          incoming.push(r);
          return r;
        });
    }
    rows(grid).splice(at, 0, ...incoming);
    if (grid === "tasks")
      for (const t of incoming) {
        t.priority = normalizePriority(t.priority);
        t.estimate = Number.isFinite(minutes(t.estimate))
          ? time(minutes(t.estimate))
          : "";
      }
    if (grid === "blocks") {
      const incomingIds = new Set(incoming.flatMap((b) => b.taskIds));
      doc().blocks = doc().blocks.filter(
        (b) =>
          incoming.includes(b) ||
          !b.autoAdded ||
          b.start ||
          !b.taskIds.every((id) => incomingIds.has(id)),
      );
    }
    if (
      grid === "tasks" &&
      parsed?.grid === "tasks" &&
      parsed.cut &&
      parsed.sourceDate === date &&
      parsed.sourceMode === mode
    ) {
      for (const { block: old, index } of parsed.blocks || []) {
        const ids = old.taskIds.filter((id) =>
          doc().tasks.some((t) => t.id === id),
        );
        if (!ids.length) continue;
        const current = doc().blocks.find((b) => b.id === old.id);
        if (current)
          current.taskIds = [...new Set([...ids, ...current.taskIds])];
        else
          doc().blocks.splice(Math.min(index, doc().blocks.length), 0, {
            ...old,
            taskIds: ids,
          });
      }
    }
  }, [grid, at, 0]);
});
window.addEventListener("resize", closeSuggestions);
window.addEventListener("scroll", closeSuggestions, true);
function prepareData(raw) {
  const incoming = migrate(raw);
  validate(incoming);
  incoming.syncRevision = 1;
  for (const d of Object.values(incoming.days)) {
    normalizeDocument(d.plan);
    deriveEnds(d.plan);
    if (d.actual) {
      normalizeDocument(d.actual);
      registerTasks(incoming, d.actual);
    }
  }
  return incoming;
}
try {
  data = prepareData(await repo.load());
  render();
} catch {
  document.querySelector("#app").innerHTML =
    `<main><h1>No pudimos leer tus datos</h1><p>${localMode ? "Los datos locales se conservaron en jornada.v1." : "No se pudieron cargar los datos del servidor. Verificá que esté iniciado y recargá. No se modificaron los datos guardados."}</p></main>`;
}
