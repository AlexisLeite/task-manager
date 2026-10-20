import {shiftAgenda,dateKey} from "./time-control.js";
import {alphabetical} from "./option-order.js";
import {syncRecordedProject} from './recorded-project.js';
import {shiftDate, endMinute, canonicalWorkspace, refreshContinuations, sourceSchedule, removeDayPortions} from "./overnight.js";
import { openGridOptions } from "./grid-options.js";
import { projectsHtml, bindProjects, projectOptions } from "./projects.js";
import "./history.css";
import { timeFieldAttributes, bindTimeFields } from "./time-field.js";
bindTimeFields();
import autoAnimate from "@formkit/auto-animate";
import "./style.css";
import { historyHtml } from "./history.js";
import { bindHistoryControls } from "./history-interactions.js";
import { Repository, LocalStorageAdapter, BackendAdapter } from "./storage.js";
import { ensureSession, username, logout } from "./auth.js";
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
  union,
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
let timePreview = null;
const appNow = () => new Date(timePreview ?? data?.timeControl?.pausedAt ?? Date.now());
const today = () => {
  const d = appNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const selectedDateKey = 'jornada.selectedDate';
function restoreSelectedDate() {
  try {
    const saved = localStorage.getItem(selectedDateKey);
    if (/^\d{4}-\d{2}-\d{2}$/.test(saved || '') &&
        new Date(`${saved}T12:00:00Z`).toISOString().slice(0,10) === saved) return saved;
  } catch {}
  return today();
}
function setSelectedDate(value) {
  date = value;
  try { localStorage.setItem(selectedDateKey,value); } catch {}
}
const fields = {
  tasks: ["code", "estimate", "priority", "name", "projectId", "start", "end"],
  blocks: ["refs", "description", "start", "end"],
};
const labels = {
  tasks: ["Identificador", "Duración", "Prioridad", "Descripción", "Proyecto", "Hora inicio", "Hora fin"],
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
const viewRoutes = {
  focus: "foco",
  day: "jornada",
  month: "historia",
  projects: "proyectos",
};
let historyFilters = { from: "", to: "" };
const routeView = () =>
  location.hash === "#/mes"
    ? "month"
    : Object.keys(viewRoutes).find(
        (key) => location.hash === `#/${viewRoutes[key]}`,
      ) || "focus";
let pageTransition;
let isRendering = false;
function navigate(next, push = true) {
  if (push && location.hash !== `#/${viewRoutes[next]}`)
    window.history.pushState(null, "", `#/${viewRoutes[next]}`);
  if (next === view) return;
  const order = ["focus", "day", "month", "projects"];
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
  date = restoreSelectedDate(),
  mode = "plan",
  view = routeView(),
  history = [],
  future = [],
  selection = { grid: null, indices: new Set(), anchor: 0 },
  suggestions = null,
  status = "Guardado",
  revision = 0,
  lastGrid = "tasks",
  overnightNavigation = null;
const day = () => (data.days[date] ||= { plan: newDocument(), actual: null });
const doc = () => day()[mode];
const rows = (grid) => doc()?.[grid] || [];
const isDark = () => document.documentElement.dataset.theme === "dark";
const notice = (message) => {
  const node = document.querySelector("#notice");
  if (node) node.textContent = message;
};
function checkpoint() {
  history.push(JSON.stringify(canonicalWorkspace(data)));
  if (history.length > 150) history.shift();
  future = [];
}
function updateClock() {
  const clockButton = document.querySelector('#app-clock');
  const toggle = document.querySelector('#clock-toggle');
  if (!clockButton || !toggle) return;
  const now = appNow();
  clockButton.textContent = `${time(now.getHours()*60+now.getMinutes())}:${String(now.getSeconds()).padStart(2,'0')}`;
  const paused = data?.timeControl?.pausedAt != null;
  toggle.setAttribute('aria-label',paused ? 'Reanudar el tiempo' : 'Pausar el tiempo');
  toggle.title = paused ? 'Reanudar el tiempo' : 'Pausar el tiempo';
  toggle.innerHTML = paused ? '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2l9 6-9 6z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2v12M12 2v12" stroke="currentColor" stroke-width="3"/></svg>';
  toggle.setAttribute('aria-pressed',String(paused));
  clockButton.closest('.app-clock').classList.toggle('paused',paused || timePreview !== null);
}
function applyTimeShift(from) {
  checkpoint();
  data = shiftAgenda(data,from,Date.now());
  timePreview = null;
  refreshContinuations(data);
  if (view === 'focus') { updateClock(); refreshFocus(); }
  else render();
  save();
}
function toggleClock() {
  if (data.timeControl?.pausedAt != null) applyTimeShift(data.timeControl.pausedAt);
  else {
    checkpoint();
    data.timeControl = {pausedAt:Date.now()};
    updateClock(); refreshFocus(); save();
  }
}
async function openTimeTravel() {
  const initial = appNow();
  navigate('focus');
  if (pageTransition) await pageTransition.finished;
  const dialog = document.createElement('dialog');
  dialog.className = 'task-dialog time-travel-dialog';
  dialog.setAttribute('aria-label','Control del tiempo');
  dialog.innerHTML = `<form><h2>Control del tiempo</h2><label>Día<input name="day" type="date" value="${dateKey(initial)}" required></label><label>Hora<input name="hour" ${timeFieldAttributes()} value="${time(initial.getHours()*60+initial.getMinutes())}" required></label><p class="time-travel-hint">Scroll: 15 minutos</p><p role="alert"></p><div class="dialog-actions"><button type="button" data-dismiss>Cancelar</button><button type="submit">Aplicar</button></div></form>`;
  const dayInput = dialog.querySelector('[name=day]'), hourInput = dialog.querySelector('[name=hour]');
  const preview = () => {
    const hour = parseTimeInput(hourInput.value,true);
    const stamp = hour ? new Date(`${dayInput.value}T${hour}:00`).getTime() : NaN;
    const valid = Number.isFinite(stamp);
    dialog.querySelector('[role=alert]').textContent = valid ? '' : 'Ingresá una fecha y hora válidas.';
    if (valid) { timePreview = stamp; updateClock(); refreshFocus(); }
    return valid ? stamp : null;
  };
  dialog.querySelector('form').oninput = preview;
  const step = amount => {
    const stamp = preview();
    if (stamp === null) return;
    const target = new Date(stamp);
    const minute = target.getHours()*60+target.getMinutes();
    target.setHours(0,amount > 0 ? (Math.floor(minute/15)+1)*15 : (Math.ceil(minute/15)-1)*15,0,0);
    const currentOption = new Date(initial);
    currentOption.setSeconds(0,0);
    if ((amount > 0 && currentOption.getTime() > stamp && currentOption < target) ||
        (amount < 0 && currentOption.getTime() < stamp && currentOption > target))
      target.setTime(currentOption.getTime());
    dayInput.value = dateKey(target);
    hourInput.value = time(target.getHours()*60+target.getMinutes());
    preview();
  };
  hourInput.addEventListener('wheel',event=>{event.preventDefault();step(event.deltaY>0?-1:1);},{passive:false});
  hourInput.onkeydown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault();step(event.key==='ArrowDown'?-1:1);}
  };
  dialog.querySelector('[data-dismiss]').onclick = ()=>dialog.close();
  dialog.onclick = event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  };
  dialog.onclose = ()=>{
    document.body.classList.remove('time-travel-open');
    timePreview = null; updateClock(); refreshFocus();
    setTimeout(()=>dialog.remove(),200);
  };
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    const stamp = preview();
    if (stamp === null) return;
    applyTimeShift(stamp);
    dialog.close();
  };
  document.body.append(dialog);
  document.body.classList.add('time-travel-open');
  dialog.showModal();
  preview();
  hourInput.focus(); hourInput.select();
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
    await repo.save(canonicalWorkspace(data));
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
  render(true);
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
  to.push(JSON.stringify(canonicalWorkspace(data)));
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
function confirmDeleteRows() {
  if (!selection.indices.size) return;
  const picked = {grid:selection.grid, indices:[...selection.indices]};
  const trigger = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'task-dialog';
  dialog.setAttribute('aria-label','Eliminar tarea');
  const names = picked.indices.map(i=>rows(picked.grid)[i]?.name || rows(picked.grid)[i]?.code || '').join(', ');
  dialog.innerHTML = `<form><h2>Eliminar ${picked.indices.length === 1 ? 'tarea' : 'tareas'}</h2><p>${esc(names)}</p><p>Se quitará solamente la parte de esta jornada. Las horas realizadas se conservan.</p><div class="dialog-actions"><button type="button" data-dismiss autofocus>Cancelar</button><button type="submit">Eliminar</button></div></form>`;
  dialog.querySelector('[data-dismiss]').onclick = ()=>dialog.close();
  dialog.onclick = event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  };
  dialog.onclose = ()=>{ setTimeout(()=>dialog.remove(),200); if (trigger?.isConnected) trigger.focus(); };
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    dialog.close();
    selection.grid = picked.grid;
    selection.indices = new Set(picked.indices);
    deleteRows();
  };
  document.body.append(dialog);
  dialog.showModal();
}
function deleteRows(portionOnly = true) {
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
      if (portionOnly) {
        data = removeDayPortions(data,date,removed);
        return;
      }
      for (const day of Object.values(data.days)) {
        day.plan.tasks = day.plan.tasks.filter(t=>!removed.has(t.id));
        day.plan.blocks = day.plan.blocks.map(b=>({...b,taskIds:b.taskIds.filter(id=>!removed.has(id))})).filter(b=>b.taskIds.length || b.refsText);
      }
      doc().blocks = doc()
        .blocks.map((b) => ({
          ...b,
          taskIds: b.taskIds.filter((id) => !removed.has(id)),
        }))
        .filter((b) => b.taskIds.length || b.refsText);
    }
    if (grid !== "tasks") doc()[grid] = rows(grid).filter((_, i) => !selection.indices.has(i));
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
  if (!doc() || mode === "actual") return;
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
    const statusCell = tr.querySelector(".plan-status");
    if (statusCell) statusCell.innerHTML = grid === "tasks" ? taskStatusControl(r) : planStatus(r);
    const play = tr.querySelector("[data-start-task]");
    if (play) play.hidden = !canStartTask(r);
    const stop = tr.querySelector("[data-stop-task]");
    if (stop) stop.hidden = !runningGridTask(r);
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
  document.querySelectorAll(".priority-dots[data-block]").forEach((el) => {
    el.innerHTML = priorityDots(doc().blocks[+el.dataset.block]);
    el.closest("td").style.setProperty(
      "--priority-space",
      `${el.children.length * 15 + 10}px`,
    );
  });
  document
    .querySelectorAll('[data-grid="tasks"][data-col="2"]')
    .forEach((el) => {
      const t = doc().tasks[+el.dataset.row];
      if (!t) return;
      el.dataset.priorityValue = t.priority;
      const dot = el.querySelector(".priority-dot");
      dot.className = `priority-dot ${t.priority.toLowerCase()}`;
      dot.setAttribute("aria-label", `${t.code}: ${t.priority}`);
      dot.title = `${t.code}: ${t.priority}`;
      el.closest("details")
        .querySelectorAll("[data-plan-priority]")
        .forEach((button) =>
          button.setAttribute(
            "aria-pressed",
            button.dataset.planPriority === t.priority,
          ),
        );
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
        el.value = taskValue(doc().tasks[+el.dataset.row], "estimate");
    });
  document
    .querySelectorAll('[data-grid="tasks"][data-col="4"]')
    .forEach((el) => {
      if (el !== document.activeElement)
        el.value = doc().tasks[+el.dataset.row]?.projectId || "";
    });
  document.querySelectorAll('[data-grid="tasks"][data-col="5"], [data-grid="tasks"][data-col="6"]').forEach(el => {
    if (el !== document.activeElement) el.value = taskValue(doc().tasks[Number(el.dataset.row)], fields.tasks[Number(el.dataset.col)]);
  });
  refreshWorkedTotal();
  document.querySelector("#undo").disabled = !history.length;
  document.querySelector("#redo").disabled = !future.length;
}
function refreshWorkedTotal() {
  const total = document.querySelector('#total');
  if (!total) return;
  const active = activeFocus();
  const resumed = new Set(active.flatMap(entry => [
    `${entry.block.id}/${entry.task.id}`, entry.block.resumeSourceFocus,
  ]).filter(Boolean));
  const actual = data.days[date]?.actual;
  const blocks = (actual?.blocks || []).filter(row =>
    !row.refsText && resolved(actual, row).length && !resumed.has(row.sourceFocus));
  const offset = (new Date(`${today()}T00:00:00`) - new Date(`${date}T00:00:00`)) / 60000;
  for (const entry of active) {
    const start = Math.max(0, Math.floor(entry.start / 60) + offset);
    const end = Math.min(1440, Math.floor(Math.min(entry.current, entry.end) / 60) + offset);
    if (end > start) blocks.push({start:time(start),end:time(end)});
  }
  total.textContent = `Trabajado: ${format(union(blocks))} hs`;
}
function closeSuggestions() {
  if (suggestions) {
    suggestions.input.setAttribute("aria-expanded", "false");
    suggestions.input.removeAttribute("aria-activedescendant");
  }
  document.querySelector("#suggestions")?.remove();
  suggestions = null;
}
function showSuggestions(input, all = false) {
  closeSuggestions();
  const query = all ? "" : normalize(input.value);
  const matches = data.tasks
    .filter(
      (t) => normalize(t.name).includes(query) && normalize(t.name) !== query,
    )
    .sort((a,b)=>alphabetical(a.name,b.name))
    .slice(0,8);
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
  r.projectId = t.projectId || "";
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
    if (b.continuation) continue;
    const tasks = resolved(document, b),
      sizes = tasks.map((t) => minutes(t.estimate));
    const n = Math.max(0, ...sizes);
    b.end =
      clock(b.start) &&
      tasks.length &&
      sizes.every(Number.isFinite) &&
      n > 0 &&
      n <= 1440
        ? time((minutes(b.start) + n) % 1440)
        : "";
    b.endDay = b.end && minutes(b.start) + n >= 1440 ? 1 : 0;
  }
}
function priorityDots(b) {
  if (!b) return "";
  return resolved(doc(), b)
    .map((t) => priorityControl(t))
    .join("");
}
function priorityControl(
  t,
  attrs = `aria-label="Prioridad de ${esc(t.code)}: ${esc(t.name)}"`,
) {
  return `<details class="focus-menu plan-priority" data-priority-id="${esc(t.id)}"><summary ${attrs} data-priority-value="${t.priority}"><span class="priority-dot ${t.priority.toLowerCase()}" role="img" aria-label="${esc(t.code)}: ${t.priority}" title="${esc(t.code)}: ${t.priority}"></span></summary><div popover="manual">${["Alta", "Baja", "Media"].map((p) => `<button data-plan-priority="${p}" data-task-id="${esc(t.id)}" aria-pressed="${p === t.priority}"><span class="priority-dot ${p.toLowerCase()}"></span> ${p}</button>`).join("")}</div></details>`;
}
const columnOrder = (grid) =>
  grid === "tasks" ? [2, 0, 3, 1, 5, 6, 4] : [0, 1, 2, 3];
function planStatus(row) {
  return row.taskIds
    .map((id) => {
      const task = doc().tasks.find((task) => task.id === id);
      const state = row.focusStates?.[id];
      const label =
        state === "finished"
          ? "Terminada"
          : state === "cancelled"
            ? "Cancelada"
            : "Pendiente";
      const shape =
        state === "finished"
          ? '<path d="m3 8 3 3 7-7"/>'
          : state === "cancelled"
            ? '<path d="m4 4 8 8M12 4l-8 8"/>'
            : '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>';
      return `<span class="plan-status-icon" data-status="${state === "finished" ? "finished" : state === "cancelled" ? "cancelled" : "pending"}" role="img" aria-label="${esc(task?.code || "")}: ${label}" title="${esc(task?.name || task?.code || "")}: ${label}"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg></span>`;
    })
    .join("");
}
function taskSchedule(t) {
  return doc().blocks.find(row => row.taskIds.includes(t.id));
}
function runningGridTask(t) {
  const {row,key} = sourceSchedule(data,date,taskSchedule(t));
  return activeFocus().find(entry => entry.date === key && entry.block.id === row?.id && entry.task.id === t.id);
}
function stopGridTask(t) {
  const entry = runningGridTask(t);
  if (!entry) return;
  const action = document.createElement('button');
  Object.assign(action.dataset, {focusAction:'finish',actionDate:entry.date,actionBlock:entry.block.id,actionTask:t.id});
  actOnFocus(action);
  render(true);
}
function canStartTask(t) {
  const {row,key} = sourceSchedule(data,date,taskSchedule(t));
  const state = row?.focusStates?.[t.id];
  if (state === 'finished') return true;
  if (state) return false;
  return !activeFocus().some(entry => entry.date === key && entry.block.id === row?.id && entry.task.id === t.id);
}
function startGridTask(t) {
  if (!canStartTask(t)) return;
  const {row,key} = sourceSchedule(data,date,taskSchedule(t));
  if (!row) return;
  const original = data.days[key].plan.tasks.find(item => item.id === t.id);
  const finished = row.focusStates?.[t.id] === 'finished';
  const sourceFocus = `${row.id}/${t.id}`;
  const consumed = finished ? Object.values(data.days).flatMap(day => day.actual?.blocks || [])
    .filter(item => item.sourceFocus === sourceFocus)
    .reduce((total,item) => total + Math.max(0,minutes(item.end)-minutes(item.start)),0) : 0;
  const start = new Date(appNow().getTime()-consumed*60000);
  const targetKey = dateKey(start), startMinute = start.getHours()*60+start.getMinutes();
  const length = finished ? 0 : minutes(original.estimate);
  commit(() => {
    // Remove projections before moving the canonical execution to another day.
    data = canonicalWorkspace(data);
    const source = data.days[key].plan;
    const current = source.blocks.find(item => item.id === row.id);
    const moved = {...current,taskIds:[t.id],focusStates:{},start:time(startMinute),
      end:length>0 ? time((startMinute+length)%1440) : '',
      endDay:length>0 ? Math.floor((startMinute+length)/1440) : 0,
      openStarted:!(length>0),pauseOffsetMs:0};
    if (current.taskIds.length > 1) {
      current.taskIds = current.taskIds.filter(id => id !== t.id);
      moved.id = uid();
      if (finished) moved.resumeSourceFocus = sourceFocus;
    } else source.blocks = source.blocks.filter(item => item !== current);
    const target = (data.days[targetKey] ||= {plan:newDocument(),actual:null}).plan;
    let targetTask = target.tasks.find(item => item.id === t.id);
    if (!targetTask) {
      targetTask = {...original};
      if (target.tasks.some(item => item.code === targetTask.code)) targetTask.code = nextCode(target.tasks);
      target.tasks.push(targetTask);
    }
    if (finished) targetTask.estimate = '';
    target.blocks.push(moved);
    if (source !== target && !source.blocks.some(item => item.taskIds.includes(t.id)))
      source.tasks = source.tasks.filter(item => item.id !== t.id);
    setSelectedDate(targetKey);
  });
}
function taskValue(t, field) {
  if (!t) return '';
  const row = taskSchedule(t);
  if (field === 'estimate' && mode === 'plan' && date === today()) {
    const running = runningGridTask(t);
    if (running?.openEnded) return time(Math.floor(Math.max(0, running.current - running.start) / 60));
  }
  if (field === 'estimate' && (row?.endDay || row?.continuation))
    return time(row.continuation ? minutes(row.end) : 1440 - minutes(row.start));
  if (field === 'end' && row?.endDay) return '24:00';
  return ['start', 'end'].includes(field) ? row?.[field] || '' : t[field] || '';
}
function taskStatusIcon(t) {
  const {row,key} = sourceSchedule(data,date,taskSchedule(t));
  const running = activeFocus().some(entry => entry.date === key && entry.block.id === row?.id && entry.task.id === t.id);
  if (!running) return planStatus({...row,taskIds:[t.id]});
  return `<span class="plan-status-icon" data-status="running" role="img" aria-label="${esc(t.code)}: En ejecución" title="${esc(t.name || t.code)}: En ejecución"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5" opacity=".2"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"/></svg></span>`;
}
function refreshGridStatus() {
  if (view !== 'day' || mode !== 'plan') return;
  refreshWorkedTotal();
  document.querySelectorAll('[data-table="tasks"] tbody tr').forEach(tr => {
    const t = rows('tasks')[+tr.dataset.index];
    if (!t) return;
    const icon = tr.querySelector('.plan-status-icon');
    const html = taskStatusIcon(t);
    // Replace only a changed icon; keep the status button and any edited cell focused.
    if (icon && icon.dataset.status !== html.match(/data-status="([^"]+)"/)?.[1]) icon.outerHTML = html;
    const play = tr.querySelector('[data-start-task]');
    if (play) play.hidden = !canStartTask(t);
    const stop = tr.querySelector("[data-stop-task]");
    if (stop) stop.hidden = !runningGridTask(t);
    const estimate = tr.querySelector('input[data-col="1"]');
    if (estimate && estimate !== document.activeElement) {
      const value = taskValue(t, 'estimate');
      if (estimate.value !== value) estimate.value = value;
    }
  });
}
function taskStatusControl(t) {
  const row = taskSchedule(t);
  const icon = taskStatusIcon(t);
  if (row?.focusStates?.[t.id] === 'finished') return icon;
  return `<button class="status-trigger" data-task-status="${esc(t.id)}" aria-label="Cambiar estado de ${esc(t.code)}" aria-haspopup="listbox">${icon}</button>`;
}
function changeTaskStatus(t, state) {
  const {row,key} = sourceSchedule(data,date,taskSchedule(t));
  if (!row || row.focusStates?.[t.id] === 'finished') return;
  if (state === 'finished' && (!clock(row.start) || !clock(row.end) || endMinute(row) <= minutes(row.start))) {
    notice('Indicá un horario válido antes de completar la tarea.');
    return;
  }
  commit(() => {
    if (state === 'finished') recordFocusWork(key, row, t, row.end);
    if (state === 'pending') delete (row.focusStates ||= {})[t.id];
    else (row.focusStates ||= {})[t.id] = state;
  });
}
function gridHtml(grid) {
  return `<div class="grid-scroll"><table data-table="tasks" class="day-grid" aria-label="Tareas de la jornada"><colgroup><col class="grip-col"><col class="status-col"><col class="code-col"><col><col class="estimate-col"><col class="time-col"><col class="time-col"><col class="project-col"><col class="delete-col"></colgroup><thead><tr>${['', 'Estado', 'Tarea', 'Descripción', 'Duración', 'Hora inicio', 'Hora fin', 'Proyecto', ''].map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows('tasks').map((t,i) => `<tr data-index="${i}" aria-selected="false"><td><button class="handle" draggable="true" data-handle="tasks" data-index="${i}" aria-label="Seleccionar tarea ${i+1}">⠿</button></td><td class="plan-status">${taskStatusControl(t)}</td>${[0,3,1,5,6,4].map(c => {
    const field = fields.tasks[c];
    const attrs = `data-grid="tasks" data-row="${i}" data-col="${c}" aria-label="Tarea ${i+1}: ${labels.tasks[c]}"`;
    if(field === 'projectId') return `<td><select ${attrs}>${projectOptions(data,t.projectId)}</select></td>`;
    return `<td class="${c===0?'refs-cell':[1,5,6].includes(c)?'hours':''}">${c===0?`<span class="priority-dots">${priorityControl(t, `data-grid="tasks" data-row="${i}" data-col="2" aria-label="Tarea ${i+1}: Prioridad"`)}</span>`:''}<input ${attrs} value="${esc(taskValue(t,field))}" ${[1,5,6].includes(c)?timeFieldAttributes(c===6?'end':c!==1): 'autocomplete="off"'} ${field==='name'?'role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions"':''}></td>`;
  }).join('')}<td><div class="task-row-actions"><button class="start-task" data-start-task="${esc(t.id)}" aria-label="Iniciar ${esc(t.code)}" title="Iniciar tarea" ${canStartTask(t)?'':'hidden'}><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg></button><button class="stop-task" data-stop-task="${esc(t.id)}" aria-label="Terminar ${esc(t.code)}" title="Terminar tarea" ${runningGridTask(t)?'':'hidden'}><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="1"/></svg></button><button class="postpone-task" data-postpone-task="${esc(t.id)}" aria-label="Posponer ${esc(t.code)}" title="Posponer tarea"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-9 4h5m-2-2 2 2-2 2"/></svg></button><button class="delete-task" data-delete-task="${esc(t.id)}" aria-label="Eliminar ${esc(t.code)}" title="Eliminar tarea"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg></button></div></td></tr>`).join('')}</tbody></table></div><button class="add" id="add-tasks">+ Tarea</button>`;
}

function activeFocus() {
  const now = appNow();
  const current =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const plan = data.days[today()]?.plan;
  const active = new Map();
  for (const key of Object.keys(data.days).filter(key=>key<=today())) {
  const source = data.days[key]?.plan;
  for (const b of source?.blocks || []) {
    const openEnded = b.openStarted && !b.end;
    if (b.continuation || (key !== today() && !b.endDay && !openEnded) || !clock(b.start) || (!clock(b.end) && !openEnded) || b.refsText) continue;
    const offset = (new Date(`${key}T00:00:00`)-new Date(`${today()}T00:00:00`))/1000;
    const start = minutes(b.start) * 60 + offset,
      end = openEnded ? Infinity : endMinute(b) * 60 + offset;
    if (start > current || end <= start) continue;
    for (const t of resolved(source, b)) {
      if (b.focusStates?.[t.id]) continue;
      const previous = active.get(t.id);
      if (!previous || end > previous.end)
        active.set(t.id, {
          task: t,
          block: b,
          date: key,
          start,
          end,
          current,
          openEnded,
        });
    }
  }
  }
  const order = plan?.focusOrder || [];
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  const groups = new Map();
  for (const entry of [...active.values()].sort(
    (a, b) => a.end - b.end || rank(a.task.id) - rank(b.task.id),
  )) {
    const key = `${entry.start}-${entry.end}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()].flat();
}
function upcomingFocus() {
  const now = appNow(),
    horizon = new Date(now.getTime() + 3 * 3600000);
  const result = [];
  for (const offset of [0, 1]) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + offset);
    const key = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
    const plan = data.days[key]?.plan;
    for (const b of plan?.blocks || []) {
      if (offset === 0 && !b.end && !b.openStarted && !b.continuation) {
        for (const t of resolved(plan,b)) {
          if ((t.estimate && b.start) || b.focusStates?.[t.id]) continue;
          result.push({block:b,date:key,task:t,start:Infinity,label:b.start,key:`next-${key}-${b.id}-${t.id}`,openEnded:true});
        }
        continue;
      }
      if (
        !clock(b.start) ||
        !clock(b.end) ||
        b.refsText ||
        b.continuation || endMinute(b) <= minutes(b.start)
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
  const actions = [
    ["definition", "Ver definición"],
    [
      pending ? "start" : "finish",
      pending ? "Iniciar tarea" : "Terminar tarea",
    ],
    ...(!pending && !entry.openEnded ? [["extend", "Extender tarea"]] : []),
    ["postpone", "Posponer tarea"],
    ["cancel", "Cancelar tarea"],
  ];
  return `<details class="focus-menu"><summary aria-label="Opciones de ${esc(entry.task.name || entry.task.code)}">⋮</summary><div>${actions.map(([action, label]) => `<button data-focus-action="${action}" data-action-date="${entry.date}" data-action-block="${esc(entry.block.id)}" data-action-task="${esc(entry.task.id)}">${label}</button>${action === "definition" ? '<hr role="separator">' : ""}`).join("")}</div></details>`;
}
function extendTask(key, blockId, taskId, choose = false) {
  const plan = data.days[key]?.plan;
  const row = plan?.blocks.find((item) => item.id === blockId);
  const task = plan?.tasks.find((item) => item.id === taskId);
  if (!row || !task) return;
  const dialog = document.createElement("dialog");
  dialog.className = "task-dialog";
  dialog.setAttribute(
    "aria-label",
    choose ? "Continuar tarea" : "Extender tarea",
  );
  const showExtension = () => {
    const now = appNow();
    const suggested = time(
      Math.min(
        1439,
        Math.max(minutes(row.end), now.getHours() * 60 + now.getMinutes()) + 30,
      ),
    );
    dialog.innerHTML = `<form><h2>Extender tarea</h2><p>${esc(task.name || task.code)}</p><label>Hora de finalización<input name="end" ${timeFieldAttributes()} required value="${suggested}"></label><p role="alert"></p><div class="dialog-actions"><button type="button" data-dismiss>Cancelar</button><button type="submit">Extender</button></div></form>`;
    dialog.querySelector("[data-dismiss]").onclick = () => dialog.close();
    dialog.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const end = dialog.querySelector("input").value;
      if (!clock(end) || new Date(`${key}T${end}:00`) <= appNow()) {
        dialog.querySelector("[role=alert]").textContent =
          "Elegí una hora hh:mm posterior al momento actual.";
        return;
      }
      if (!plan.blocks.includes(row) || row.focusStates?.[taskId]) {
        dialog.querySelector("[role=alert]").textContent =
          "La tarea cambió. Cerrá el diálogo y volvé a intentarlo.";
        return;
      }
      checkpoint();
      if (row.taskIds.length > 1) {
        row.taskIds = row.taskIds.filter((id) => id !== taskId);
        plan.blocks.push({
          ...structuredClone(row),
          id: uid(),
          taskIds: [taskId],
          end,
          intentionalRepeat: true,
        });
      } else row.end = end;
      task.estimate = time((minutes(end) - minutes(row.start) + 1440) % 1440);
      deriveEnds(plan);
      dialog.close();
      refreshFocus();
      save();
    };
    dialog.querySelector("input").focus();
    dialog.querySelector("input").select();
  };
  if (choose) {
    dialog.innerHTML = `<h2>Continuar tarea</h2><p>${esc(task.name || task.code)}</p><div class="dialog-actions"><button data-extend>Extender tarea</button><button data-reschedule>Reprogramar tarea</button></div>`;
    dialog.querySelector("[data-extend]").onclick = showExtension;
    dialog.querySelector("[data-reschedule]").onclick = () => {
      dialog.close();
      postponeTask(key, blockId, taskId, true);
    };
  } else showExtension();
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  });
  dialog.addEventListener(
    "close",
    () => setTimeout(() => dialog.remove(), 200),
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
}
function postponeTask(key, blockId, taskId, reconcile = false) {
  const source = data.days[key]?.plan;
  const original = source?.blocks.find((item) => item.id === blockId);
  const originalTask = source?.tasks.find((item) => item.id === taskId);
  if (!original || !originalTask) return;
  const length = minutes(originalTask.estimate) || duration(original) || 0;
  const originalState = original.focusStates?.[taskId];
  const initial = new Date(
    Math.max(appNow().getTime(), (clock(original.start) ? new Date(`${key}T${original.start}:00`).getTime() : appNow().getTime())) +
      30 * 60000,
  );
  if (initial.getHours() * 60 + initial.getMinutes() + length >= 1440) {
    initial.setDate(initial.getDate() + 1);
    initial.setHours(9, 0, 0, 0);
  }
  const initialDate = `${initial.getFullYear()}-${String(initial.getMonth() + 1).padStart(2, "0")}-${String(initial.getDate()).padStart(2, "0")}`;
  const dialog = document.createElement("dialog");
  dialog.className = "task-dialog";
  dialog.setAttribute("aria-labelledby", "postpone-title");
  dialog.innerHTML = `<form><h2 id="postpone-title">${reconcile ? "Reprogramar tarea" : "Posponer tarea"}</h2><p>${esc(originalTask.name || originalTask.code)}</p><label>Día<input name="day" type="date" required min="${today()}" value="${initialDate}"></label><label>Hora (opcional)<input name="hour" ${timeFieldAttributes()} value="${clock(original.start) ? time(initial.getHours() * 60 + initial.getMinutes()) : ''}"></label><p>Duración: ${esc(time(length))}</p>${reconcile ? `<label>Tiempo trabajado<input name="worked" ${timeFieldAttributes(false)} required value="00:00"></label>` : ""}<p class="dialog-error" role="alert"></p><div class="dialog-actions"><button type="button" data-dismiss>Cancelar</button><button type="submit">${reconcile ? "Reprogramar" : "Posponer"}</button></div></form>`;
  dialog.querySelector('form').oninput = () => { dialog.querySelector('[role="alert"]').textContent = ''; };
  document.body.append(dialog);
  dialog.querySelector("[data-dismiss]").onclick = () => dialog.close();
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  });
  dialog.addEventListener(
    "close",
    () => setTimeout(() => dialog.remove(), 200),
    { once: true },
  );
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    const targetDate = dialog.querySelector('[name="day"]').value;
    const start = dialog.querySelector('[name="hour"]').value;
    const scheduled = new Date(`${targetDate}T${start}:00`);
    const error = dialog.querySelector("[role=alert]");
    if (
      !targetDate || targetDate < today() ||
      (start && (!clock(start) || !Number.isFinite(scheduled.getTime()) || scheduled <= appNow()))
    ) {
      error.textContent =
        "Elegí hoy o un día posterior. Si indicás hora, debe ser posterior al momento presente.";
      return;
    }
    if (start && length && minutes(start) + length > 1440) {
      error.textContent =
        "La tarea debe terminar dentro del día elegido. Elegí una hora más temprana.";
      return;
    }
    if (
      !source.blocks.includes(original) ||
      !original.taskIds.includes(taskId) ||
      original.focusStates?.[taskId] !== originalState
    ) {
      error.textContent =
        "Esta tarea cambió. Cerrá el diálogo y volvé a intentarlo.";
      return;
    }
    const worked = reconcile ? parseTimeInput(dialog.querySelector('[name="worked"]').value) : '00:00';
    const workedMinutes = minutes(worked || '');
    const elapsed = Math.floor((appNow().getTime() - new Date(`${key}T${original.start}:00`).getTime()) / 60000);
    if (reconcile && (!Number.isFinite(workedMinutes) || workedMinutes > elapsed)) {
      error.textContent = 'Ingresá el tiempo trabajado en hh:mm, sin superar el tiempo transcurrido desde el inicio.';
      return;
    }
    checkpoint();
    if (reconcile && workedMinutes > 0) {
      const finish = minutes(original.start) + workedMinutes;
      recordFocusWork(key, original, originalTask, time(finish % 1440), finish);
    }
    const target = (data.days[targetDate] ||= {
      plan: newDocument(),
      actual: null,
    }).plan;
    let moved = originalTask;
    if (target !== source) {
      moved = {
        ...structuredClone(originalTask),
        id: uid(),
        code: nextCode(target.tasks),
      };
      target.tasks.push(moved);
    }
    target.blocks.push({
      ...block(),
      taskIds: [moved.id],
      start,
      end: start && length ? time(minutes(start) + length) : '',
      description: moved.name,
      intentionalRepeat: true,
    });
    original.taskIds = original.taskIds.filter((id) => id !== taskId);
    source.blocks = source.blocks.filter(
      (item) => item.taskIds.length || item.refsText,
    );
    if (
      target !== source &&
      !source.blocks.some((item) => item.taskIds.includes(taskId))
    )
      source.tasks = source.tasks.filter((item) => item.id !== taskId);
    syncPlan(source);
    if (target !== source) syncPlan(target);
    dialog.close();
    if (view === "day") render(true);
    else refreshFocus();
    save();
  };
  dialog.showModal();
}
function recordFocusWork(key, b, t, end, absoluteEnd) {
  const finish = absoluteEnd ?? (minutes(end) + (b.endDay && minutes(end) <= minutes(b.start) ? 1440 : 0));
  for (const day of Object.values(data.days)) {
    if (!day.actual) continue;
    day.actual.blocks = day.actual.blocks.filter(row=>row.sourceFocus !== `${b.id}/${t.id}` && (!b.resumeSourceFocus || row.sourceFocus !== b.resumeSourceFocus));
  }
  for (let offset = 0; offset <= Math.floor((finish-1)/1440); offset++) {
    const from = Math.max(minutes(b.start),offset*1440), to = Math.min(finish,(offset+1)*1440);
    if (to <= from) continue;
    const targetDate = shiftDate(key,offset);
    data.days[targetDate] ||= {plan:newDocument(),actual:null};
    recordWorkSlice(targetDate,{...b,start:time(from-offset*1440),endDay:0},t,time(to-offset*1440));
  }
}
function recordWorkSlice(key, b, t, end) {
  const actual = (data.days[key].actual ||= newDocument());
  let performed = actual.tasks.find((item) => item.id === t.id);
  if (!performed) {
    performed = structuredClone(t);
    actual.tasks.push(performed);
  }
  performed.projectId = t.projectId || "";
  performed.name = t.name;
  for (const row of actual.blocks)
    if (row.id === b.id || row.sourceFocus === `${b.id}/${t.id}`)
      row.taskIds = row.taskIds.filter((id) => id !== performed.id);
  actual.blocks = actual.blocks.filter((row) => row.taskIds.length);
  performed.estimate = time(Math.max(0, minutes(end) - minutes(b.start)));
  actual.blocks.push({
    ...block(),
    taskIds: [performed.id],
    start: b.start,
    end,
    sourceFocus: `${b.id}/${t.id}`,
    description: performed.name,
    intentionalRepeat: true,
  });
  syncPlan(actual);
  registerTasks(data, actual);
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
  if (action === "definition") {
    button.closest("details").open = false;
    setSelectedDate(key);
    mode = "plan";
    navigate("day");
    const focus = () => {
      focusCell(
        "tasks",
        source.tasks.findIndex((item) => item.id === taskId),
        3,
      );
      document.activeElement?.scrollIntoView({ block: "center" });
    };
    if (pageTransition) pageTransition.updateCallbackDone.then(focus);
    else focus();
    return;
  }
  if (action === "extend" || action === "continue") {
    const menu = button.closest("details");
    if (menu) menu.open = false;
    extendTask(key, blockId, taskId, action === "continue");
    return;
  }
  if (action === "postpone" || action === "reschedule") {
    const menu = button.closest("details");
    if (menu) menu.open = false;
    postponeTask(key, blockId, taskId, action === "reschedule");
    return;
  }
  const now = appNow(),
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
    const elapsedDay = Math.round((new Date(`${today()}T00:00:00`)-new Date(`${key}T00:00:00`))/60000);
    const openEnded = b.openStarted && !b.end;
    const finish = openEnded ? nowMinutes+elapsedDay : Math.min(endMinute(b),nowMinutes + elapsedDay);
    if (openEnded) {
      b.end = nowTime;
      b.endDay = Math.floor(finish/1440);
      t.estimate = time(Math.max(0,finish-minutes(b.start)));
      b.openStarted = false;
    }
    recordFocusWork(key,b,t,time(finish % 1440),finish);
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
    const openEnded = !Number.isFinite(length) || length <= 0;
    if (key === today() && b.taskIds.length === 1) {
      b.start = nowTime;
      b.end = openEnded ? '' : time((nowMinutes+length)%1440);
      b.endDay = !openEnded && nowMinutes+length>=1440 ? 1 : 0;
      b.openStarted = openEnded;
    } else {
      (b.focusStates ||= {})[taskId] = "started";
      d.plan.blocks.push({
        ...block(),
        taskIds: [target.id],
        start: nowTime,
        end: openEnded ? '' : time((nowMinutes+length)%1440),
        endDay: !openEnded && nowMinutes+length>=1440 ? 1 : 0,
        openStarted:openEnded,
        description: target.name,
        intentionalRepeat: true,
      });
    }
  }
  const actionMenu = button.closest("details");
  if (actionMenu) actionMenu.open = false;
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
      const shared = active.filter(
        (other) => other.start === entry.start && other.end === entry.end,
      );
      const expired = entry.current >= entry.end;
      const progress =
        !entry.openEnded && !expired && shared.at(-1) === entry
          ? `<div class="focus-progress" role="progressbar" aria-label="Tiempo restante de ${esc(shared.map(({ task }) => task.name || task.code).join(", "))}" aria-valuemin="0" aria-valuemax="100"><div></div></div>`
          : "";
      const counter = entry.openEnded
        ? '<time data-focus-counter aria-label="Tiempo transcurrido"></time>'
        : expired
        ? `<span class="focus-expired-actions"><button data-focus-action="finish" data-action-date="${entry.date}" data-action-block="${esc(entry.block.id)}" data-action-task="${esc(t.id)}">Completa</button><span aria-hidden="true">|</span><button data-focus-action="continue" data-action-date="${entry.date}" data-action-block="${esc(entry.block.id)}" data-action-task="${esc(t.id)}">Continuar</button></span>`
        : progress
          ? '<time data-focus-counter aria-label="Tiempo restante"></time>'
          : "";
      const groupClass =
        shared.length > 1
          ? ` focus-shared${shared[0] === entry ? " focus-shared-first" : ""}${shared.at(-1) === entry ? " focus-shared-last" : ""}`
          : "";
      return `<li data-entry-key="${esc(entry.task.id)}" data-focus-id="${esc(t.id)}" data-focus-drag draggable="true" tabindex="0" class="focus-card${groupClass}">
      <div class="focus-title"><details class="focus-menu focus-priority"><summary aria-label="Prioridad de ${esc(t.name || t.code)}"><span class="priority-dot ${normalizePriority(t.priority).toLowerCase()}" aria-hidden="true"></span></summary><div>${["Alta", "Baja", "Media"].map((p) => `<button data-focus-priority="${p}" aria-pressed="${p === normalizePriority(t.priority)}"><span class="priority-dot ${p.toLowerCase()}" aria-hidden="true"></span> ${p}</button>`).join("")}</div></details><h2>${esc(t.name || t.code)}</h2></div><div class="focus-remaining">${counter}${focusMenu(entry)}</div>${progress}
    </li>`;
    })
    .join("")}${upcoming
    .map((entry) => {
      const { task: t, label, key } = entry;
      return `<li class="focus-card focus-upcoming" data-entry-key="${esc(key)}"><div class="focus-title"><span class="upcoming-priority"><span class="priority-dot ${normalizePriority(t.priority).toLowerCase()}" role="img" aria-label="Prioridad ${normalizePriority(t.priority)}"></span></span><h2>${esc(t.name || t.code)}</h2></div><div class="focus-remaining">${entry.openEnded ? "" : `<time aria-label="Horario previsto">${esc(label)} - ${esc(entry.block.end)}</time>`}<button class="focus-start" data-focus-action="start" data-action-date="${entry.date}" data-action-block="${esc(entry.block.id)}" data-action-task="${esc(t.id)}" aria-label="Iniciar ${esc(t.name || t.code)}" title="Iniciar tarea"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2l9 6-9 6z" fill="currentColor"/></svg></button>${focusMenu(entry, true)}</div></li>`;
    })
    .join(
      "",
    )}${!active.length && !upcoming.length ? '<li data-entry-key="empty" class="focus-empty">No hay actividades planificadas para este momento.</li>' : ""}</ul>`;
}
function alignFocusBars() {
  const scale = window.devicePixelRatio || 1;
  const positions = [...document.querySelectorAll(".focus-progress")].map(
    (bar) => {
      const top =
        bar.getBoundingClientRect().top - (parseFloat(bar.style.top) || 0);
      return [bar, Math.round(top * scale) / scale - top];
    },
  );
  for (const [bar, offset] of positions) bar.style.top = `${offset}px`;
}
window.addEventListener("resize", () => requestAnimationFrame(alignFocusBars));
window.addEventListener(
  "scroll",
  () => requestAnimationFrame(alignFocusBars),
  true,
);
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
      el.className = fresh.className;
      const expiredActions = el.querySelector(".focus-expired-actions");
      const incomingActions = fresh.querySelector(".focus-expired-actions");
      if (expiredActions && !incomingActions) expiredActions.remove();
      else if (!expiredActions && incomingActions)
        el.querySelector(".focus-remaining").prepend(
          incomingActions.cloneNode(true),
        );
      const currentTime = el.querySelector(
        'time[data-focus-counter]',
      );
      const incomingTime = fresh.querySelector(
        'time[data-focus-counter]',
      );
      if (currentTime && incomingTime) currentTime.setAttribute('aria-label',incomingTime.getAttribute('aria-label'));
      if (currentTime && !incomingTime) currentTime.remove();
      else if (!currentTime && incomingTime)
        el.querySelector(".focus-remaining").prepend(
          incomingTime.cloneNode(true),
        );
      const currentProgress = el.querySelector(".focus-progress");
      const incomingProgress = fresh.querySelector(".focus-progress");
      if (currentProgress && !incomingProgress) currentProgress.remove();
      else if (!currentProgress && incomingProgress)
        el.append(incomingProgress.cloneNode(true));
      for (const selector of ["h2", ".focus-upcoming time"]) {
        const current = el.querySelector(selector);
        const incoming = fresh.querySelector(selector);
        if (current && incoming && current.textContent !== incoming.textContent)
          current.textContent = incoming.textContent;
      }
      for (const [selector, attribute] of [
        ["summary", "aria-label"],
        [".focus-priority summary .priority-dot", "class"],
        [".upcoming-priority .priority-dot", "class"],
        [".upcoming-priority .priority-dot", "aria-label"],
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
    const { start, end, current, openEnded } = active[i],
      remaining = openEnded ? Math.max(0,current-start) : end - current;
    const counter = el.querySelector("time");
    if (counter)
      counter.textContent = [
        Math.floor(remaining / 3600),
        Math.floor(remaining / 60) % 60,
        remaining % 60,
      ]
        .map((n) => String(n).padStart(2, "0"))
        .join(":");
    const percent = (remaining / (end - start)) * 100,
      progress = el.querySelector('[role="progressbar"]');
    if (!progress) return;
    progress.setAttribute("aria-valuenow", percent.toFixed(2));
    progress.firstElementChild.style.width = `${percent}%`;
  });
  requestAnimationFrame(alignFocusBars);
}
function reorderFocus(id, target) {
  const order = activeFocus().map((a) => a.task.id),
    from = order.indexOf(id);
  if (from < 0 || target < 0 || target >= order.length || from === target)
    return;
  checkpoint();
  order.splice(target, 0, order.splice(from, 1)[0]);
  const plan = (data.days[today()] ||= {plan:newDocument(),actual:null}).plan;
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
  node.oncontextmenu = (event) => {
    const row = event.target.closest(".focus-card[data-entry-key]");
    if (!row) return;
    event.preventDefault();
    const menu = row.querySelector(".focus-remaining .focus-menu");
    document.querySelectorAll(".focus-menu[open]").forEach((other) => {
      if (other !== menu) other.open = false;
    });
    menu.open = true;
    const panel = menu.querySelector(":scope > div");
    panel.style.maxHeight = `${Math.max(0, innerHeight - 16)}px`;
    panel.style.overflowY = "auto";
    const bounds = panel.getBoundingClientRect();
    const anchor = menu.getBoundingClientRect();
    const x = Math.max(
      8,
      Math.min(event.clientX, innerWidth - bounds.width - 8),
    );
    const y = Math.max(
      8,
      Math.min(event.clientY, innerHeight - bounds.height - 8),
    );
    panel.style.right = "auto";
    panel.style.left = `${x - anchor.left}px`;
    panel.style.top = `${y - anchor.top}px`;
    menu.querySelector("button")?.focus({ preventScroll: true });
  };
  autoAnimate(node.querySelector(".focus-list"), { duration: 250 });
  refreshFocus();
  node.onclick = (e) => {
    const summary = e.target.closest(".focus-menu > summary");
    if (summary)
      summary.parentElement
        .querySelector(":scope > div")
        .removeAttribute("style");
    const priority = e.target.closest("[data-focus-priority]");
    if (priority) {
      const menu = priority.closest("details");
      const id = priority.closest("[data-focus-id]").dataset.focusId;
      const t = activeFocus().find(entry=>entry.task.id === id)?.task;
      if (!t) return;
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
      const menu =
        e.target.closest(".focus-menu") ||
        node.querySelector(".focus-menu[open]");
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
  document.querySelector("dialog[open]") ||
  document.activeElement?.matches(
    "input, textarea, select, [contenteditable='true']",
  );
async function pollWorkspace() {
  if (!data) return;
  updateClock();
  refreshFocus();
  refreshGridStatus();
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

function actualHtml(actual) {
  if (!actual?.blocks.length)
    return '<h2>Realizado</h2><p class="empty">Todavía no hay trabajo registrado desde Foco.</p>';
  return `<h2>Realizado</h2><div class="grid-scroll"><table aria-label="Trabajo realizado"><thead><tr><th>Tarea</th><th>Descripción</th><th>Hora inicio</th><th>Hora fin</th><th>Duración</th></tr></thead><tbody>${actual.blocks
    .map((row) => {
      const tasks = resolved(actual, row);
      return `<tr><td>${esc(tasks.map((task) => task.code).join(", "))}</td><td>${esc(tasks.map((task) => task.name).join(" / "))}</td><td>${esc(row.start)}</td><td>${esc(row.end)}</td><td>${esc(time(duration(row)))}</td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><p>Total realizado: ${esc(format(totals(actual).work))} hs</p>`;
}
function sortDayByStart(current) {
  const start = row => clock(row.start) ? minutes(row.start) : Infinity;
  const blocks = [...current.blocks].sort((a, b) => start(a) - start(b));
  const starts = new Map();
  for (const row of blocks)
    for (const id of row.taskIds)
      starts.set(id, Math.min(starts.get(id) ?? Infinity, start(row)));
  const tasks = [...current.tasks].sort((a, b) => (starts.get(a.id) ?? Infinity) - (starts.get(b.id) ?? Infinity));
  return { blocks, tasks, changed: blocks.some((row, i) => row !== current.blocks[i]) || tasks.some((row, i) => row !== current.tasks[i]) };
}
function render(keepOrder = false) {
  isRendering = true;
  closeSuggestions();
  clearSelection();
  refreshContinuations(data);
  const d = day();
  if (doc() && mode === "plan") {
    syncPlan(doc());
    if (mode === "plan") deriveEnds(doc());
    if (!keepOrder) {
      const sorted = sortDayByStart(doc());
      doc().blocks = sorted.blocks;
      doc().tasks = sorted.tasks;
    }
  }
  document.querySelector("#app").innerHTML =
    `<header class="toolbar"><nav><button id="nav-focus" class="${view === "focus" ? "active" : ""}">Foco</button><button id="nav-day" class="${view === "day" ? "active" : ""}">Jornada</button><button id="nav-history" class="${view === "month" ? "active" : ""}">Historia</button><button id="nav-projects" class="${view === "projects" ? "active" : ""}">Proyectos</button></nav><div class="dates" ${view !== "day" ? "hidden" : ""}><button id="prev" aria-label="Día anterior">←</button><input type="date" id="date" aria-label="Fecha de jornada" value="${date}"><button id="next" aria-label="Día siguiente">→</button><button id="today">Hoy</button></div><div class="settings">${localMode ? "" : `<span class="session-user">${esc(username())}</span><button id="logout">Cerrar sesión</button>`}<span role="status" id="saved" hidden>${status}</span><button id="theme" aria-label="Activar tema ${isDark() ? "claro" : "oscuro"}">${isDark() ? "☀ Claro" : "☾ Oscuro"}</button><details class="file-menu"><summary aria-label="Copias de seguridad">⋯</summary><div><button id="export">Exportar copia</button><label class="import">Importar copia<input type="file" id="import" accept="application/json"></label></div></details><div class="app-clock"><button id="app-clock" aria-label="Control del tiempo"></button><button id="clock-toggle"></button></div></div></header><main>${view === "day" ? `<div class="document-tools"><div class="tabs"><button id="plan" class="${mode === "plan" ? "active" : ""}">Planificación</button><button id="actual" class="${mode === "actual" ? "active" : ""}">Realizado</button></div><div ${mode === "actual" ? "hidden" : ""}><button id="undo" aria-label="Deshacer" ${history.length ? "" : "disabled"}>↶</button><button id="redo" aria-label="Rehacer" ${future.length ? "" : "disabled"}>↷</button></div></div>${mode === "actual" ? actualHtml(d.actual) : `${gridHtml("tasks")}<div class="document-footer"><span id="total"></span>${!doc().tasks.length && !doc().blocks.length ? '<button id="example">Cargar ejemplo</button>' : ""}</div>`}` : view === "focus" ? `<section id="focus-content" aria-label="Actividades actuales">${focusHtml()}</section>` : view === "projects" ? projectsHtml(data) : historyHtml(data, historyFilters)}<p id="notice" role="status" aria-live="polite"></p></main>`;
  document.querySelector("main").classList.toggle("wide-day", view === "day");
  bind();
  if (view === "day" && doc()) updateView();
  isRendering = false;
}

function bind() {
  bindFocus();
  bindProjects(data, checkpoint, save);
  bindHistoryControls(historyFilters, data, (key) => {
    setSelectedDate(key);
    mode = "actual";
    navigate("day");
  });
  if (view === "day" && doc() && (doc().tasks.length || doc().blocks.length)) {
    const button = document.createElement("button");
    button.id = "example";
    button.textContent = "Cargar ejemplo";
    document.querySelector(".file-menu>div").append(button);
  }
  const on = (id, fn) =>
    document.getElementById(id)?.addEventListener("click", fn);
  const changeDate = (value) => {
    if (value === date) return;
    document.documentElement.dataset.navigation =
      value > date ? "forward" : "back";
    pageTransition?.skipTransition();
    setSelectedDate(value);
    clearSelection();
    if (
      document.startViewTransition &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      pageTransition = document.startViewTransition(() => render());
    else render();
  };
  on("nav-day", () => navigate("day"));
  on("nav-focus", () => navigate("focus"));
  on("nav-history", () => navigate("month"));
  on("nav-projects", () => navigate("projects"));
  on("theme", toggleTheme);
  on("logout", async () => {
    const button = document.querySelector("#logout");
    button.disabled = true;
    try { await logout(repo); }
    catch (error) { notice(error.message); button.disabled = false; }
  });
  on("clock-toggle", toggleClock);
  on("app-clock", openTimeTravel);
  updateClock();
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
        setSelectedDate(el.dataset.date);
        mode = day().actual ? "actual" : "plan";
        navigate("day");
      }),
  );
  bindGrids();
  on("export", () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(canonicalWorkspace(data), null, 2)], { type: "application/json" }),
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
  if (mode === "actual") return;
  document
    .querySelectorAll(".priority-dots")
    .forEach((el) =>
      el
        .closest("td")
        .style.setProperty(
          "--priority-space",
          `${el.children.length * 15 + 10}px`,
        ),
    );
  const plan = document.querySelector("main");
  if (plan) {
    if (plan.priorityToggle)
      plan.removeEventListener("toggle", plan.priorityToggle, true);
    plan.addEventListener(
      "toggle",
      (plan.priorityToggle = (event) => {
        const menu = event.target.closest(".plan-priority");
        if (!menu) return;
        const panel = menu.querySelector("[popover]");
        if (menu.open) {
          const rect = menu.querySelector("summary").getBoundingClientRect();
          panel.showPopover();
          panel.style.left = `${Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8)}px`;
          panel.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 8)}px`;
        } else if (panel.matches(":popover-open")) panel.hidePopover();
      }),
      true,
    );
    plan.onclick = (event) => {
      const status = event.target.closest('[data-task-status]');
      if (status) {
        const t = doc().tasks.find(t => t.id === status.dataset.taskStatus);
        if (t) openGridOptions(status, '', [
          {label:'Programada', choose:()=>changeTaskStatus(t,'pending')},
          {label:'Completada', choose:()=>changeTaskStatus(t,'finished')},
          {label:'Cancelada', choose:()=>changeTaskStatus(t,'cancelled')},
        ]);
        return;
      }
      const postpone = event.target.closest('[data-postpone-task]');
      if (postpone) {
        const t = doc().tasks.find(t => t.id === postpone.dataset.postponeTask);
        if (t) {
          const {row,key} = sourceSchedule(data,date,taskSchedule(t));
          if (row) postponeTask(key,row.id,t.id);
        }
        return;
      }
      const stop = event.target.closest('[data-stop-task]');
      if (stop) {
        const t = doc().tasks.find(t => t.id === stop.dataset.stopTask);
        if (t) stopGridTask(t);
        return;
      }
      const play = event.target.closest('[data-start-task]');
      if (play) {
        const t = doc().tasks.find(t => t.id === play.dataset.startTask);
        if (t) startGridTask(t);
        return;
      }
      const trash = event.target.closest('[data-delete-task]');
      if (trash) {
        const index = doc().tasks.findIndex(t => t.id === trash.dataset.deleteTask);
        if (index >= 0) { select('tasks',index); confirmDeleteRows(); }
        return;
      }
      const button = event.target.closest("[data-plan-priority]");
      if (!button) return;
      const t = doc().tasks.find((item) => item.id === button.dataset.taskId);
      if (!t) return;
      checkpoint();
      const originTable = button.closest("table");
      t.priority = button.dataset.planPriority;
      button.closest("details").open = false;
      updateView();
      save();
      originTable
        .querySelector(`[data-priority-id="${t.id}"] summary`)
        ?.focus();
    };
  }
  document.querySelectorAll("[data-grid]").forEach((el) => {
    const grid = el.dataset.grid,
      i = +el.dataset.row,
      c = +el.dataset.col,
      field = fields[grid][c];
    el.onfocus = () => {
      el.dataset.focusValue = el.value;
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
      if (isRendering || !el.isConnected) return false;
      const value = parseTimeInput(el.value, field !== "estimate", field === "end");
      const unchangedElapsed = grid === 'tasks' && field === 'estimate' &&
        value === el.dataset.focusValue && runningGridTask(rows(grid)[i])?.openEnded;
      if (value !== null && !unchangedElapsed) applyTimeEdit(grid, i, field, value);
      el.value = overnightNavigation ? value : grid === "tasks" ? taskValue(rows(grid)[i], field) : rows(grid)[i]?.[field] || "";
      previousDraft = el.value;
      if (overnightNavigation) {
        const destination = overnightNavigation;
        overnightNavigation = null;
        queueMicrotask(() => {
          const show = () => { setSelectedDate(destination); render(); save(); };
          if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches)
            document.startViewTransition(show);
          else show();
        });
        return true;
      }
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
          const value = parseTimeInput(raw, field !== "estimate", field === "end");
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
      if (grid === 'tasks' && field === 'projectId' && mode === 'plan') {
        const {row} = sourceSchedule(data,date,taskSchedule(r));
        syncRecordedProject(data,row,r);
      }
      if (field === "name") {
        r.taskId =
          data.tasks.find(
            (t) =>
              normalize(t.name) === normalize(el.value) &&
              (t.projectId || "") === (r.projectId || ""),
          )?.id || r.taskId;
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
    el.onkeydown = event => {
      if (timed && event.key === 'Enter' && finishTime()) { event.preventDefault(); return; }
      gridKey(event);
    };
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
  const planTable = document.querySelector('[data-table="tasks"]');
  if (planTable)
    planTable.addEventListener("focusout", (event) => {
      if (
        isRendering ||
        !planTable.isConnected ||
        planTable.contains(event.relatedTarget) || event.relatedTarget?.closest('.grid-options')
      )
        return;
      const current = doc();
      const sorted = sortDayByStart(current);
      if (!sorted.changed) return;
      const target = event.relatedTarget;
      const targetTask = target?.dataset.grid === 'tasks' ? current.tasks[Number(target.dataset.row)]?.id : null;
      const targetCol = target?.dataset.col;
      const positions = new Map();
      for (const grid of ['tasks', 'blocks'])
        document.querySelectorAll(`[data-table="${grid}"] tbody tr`).forEach(row => {
          positions.set(`${grid}:${current[grid][Number(row.dataset.index)].id}`, row.getBoundingClientRect().top);
        });
      checkpoint();
      current.blocks = sorted.blocks;
      current.tasks = sorted.tasks;
      clearSelection();
      document.getElementById('add-tasks')?.remove();
      document.querySelector('[data-table="tasks"]').parentElement.outerHTML = gridHtml('tasks');
      document.getElementById('add-tasks').onclick = () => add('tasks');
      bindGrids();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
        for (const grid of ['tasks', 'blocks'])
          document.querySelectorAll(`[data-table="${grid}"] tbody tr`).forEach(row => {
            const before = positions.get(`${grid}:${current[grid][Number(row.dataset.index)].id}`);
            const offset = before - row.getBoundingClientRect().top;
            if (offset) row.animate([{transform:`translateY(${offset}px)`},{transform:'translateY(0)'}], {duration:250,easing:'ease'});
          });
      if (targetTask) focusCell('tasks', current.tasks.findIndex(task => task.id === targetTask), Number(targetCol));
      save();
    });
}
function syncCompletedTime(key, row, task, previousId = row?.id) {
  if (row?.focusStates?.[task.id] !== 'finished' || !clock(row.start) || !clock(row.end) || endMinute(row) <= minutes(row.start)) return;
  if (previousId !== row.id) for (const day of Object.values(data.days)) {
    if (day.actual) day.actual.blocks = day.actual.blocks.filter(block=>block.sourceFocus !== `${previousId}/${task.id}`);
  }
  recordFocusWork(key,row,task,row.end);
}
function applyTimeEdit(grid, index, field, value) {
  if (grid === 'tasks' && ['start', 'end'].includes(field)) {
    const task = rows(grid)[index];
    const displayed = taskSchedule(task);
    const {row:scheduled,key:sourceDate} = sourceSchedule(data,date,displayed);
    if (!scheduled) return false;
    if (field === 'end' && value && (!clock(scheduled.start) || minutes(value) === minutes(scheduled.start))) {
      notice('El fin debe ser posterior al inicio.');
      return false;
    }
    if (taskValue(task,field) === value && !overnightNavigation) return true;
    checkpoint();
    let target = scheduled;
    if (scheduled.taskIds.length > 1) {
      target = {...structuredClone(scheduled), id:uid(), taskIds:[task.id]};
      scheduled.taskIds = scheduled.taskIds.filter(id => id !== task.id);
      data.days[sourceDate].plan.blocks.push(target);
    }
    target[field] = value;
    if (field === 'end') {
      const length = value ? (value === '24:00' ? 1440-minutes(target.start) : (minutes(value) - minutes(target.start) + 1440) % 1440) : 0;
      task.estimate = value ? time(length) : '';
      target.endDay = value && (value === '24:00' || minutes(value) < minutes(target.start)) ? 1 : 0;
      if (target.endDay && value !== '24:00' && value !== '00:00' && !displayed.continuation) overnightNavigation = shiftDate(sourceDate);
    }
    deriveEnds(data.days[sourceDate].plan);
    syncCompletedTime(sourceDate,target,task,scheduled.id);
    if (displayed.continuation) { displayed.end = target.end; displayed.focusStates = target.focusStates; }
    updateView();
    save();
    return true;
  }
  const r = rows(grid)[index];
  if (!r) return false;
  if (grid === "tasks" && field === "estimate" && taskValue(r,field) === value) return true;
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
  if (grid === 'tasks' && field === 'estimate') {
    const shown = taskSchedule(r);
    const source = sourceSchedule(data,date,shown);
    r.estimate = value && shown?.continuation ? time(1440-minutes(source.row.start)+minutes(value)) : value;
    deriveEnds(data.days[source.key].plan);
    syncCompletedTime(source.key,source.row,r);
    if (shown?.continuation) shown.end = source.row.end;
  } else r[field] = value;
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
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    e.preventDefault();
    closeSuggestions();
    const order = columnOrder(grid);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
      focusCell(grid, Math.max(0,Math.min(rows(grid).length-1,i+(e.key==='ArrowDown'?1:-1))),c);
    else focusCell(grid,i,order[Math.max(0,Math.min(order.length-1,order.indexOf(c)+(e.key==='ArrowRight'?1:-1)))]);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.startsWith('Arrow')) {
    const input = e.target;
    const collapsed = input.selectionStart === input.selectionEnd;
    const boundary = collapsed && ((e.key === 'ArrowLeft' && input.selectionStart === 0) ||
      (e.key === 'ArrowRight' && input.selectionEnd === input.value?.length));
    if (boundary) {
      e.preventDefault();
      closeSuggestions();
      const order = columnOrder(grid);
      focusCell(grid,i,order[Math.max(0,Math.min(order.length-1,order.indexOf(c)+(e.key==='ArrowRight'?1:-1)))]);
    }
    return;
  }
  const optionsControl = e.target.matches('select, summary');
  if (optionsControl && e.target.closest('details')?.open && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    openGridOptions(e.target);
    return;
  }
  if (optionsControl && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Enter' || e.key.length === 1)) {
    e.preventDefault();
    openGridOptions(e.target, e.key === 'Enter' ? '' : e.key);
    return;
  }
  if (fields[grid]?.[c] === 'name' && e.key === 'Enter' && !suggestions && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    showSuggestions(e.target, true);
    return;
  }
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
    if (e.key === "Enter" && suggestions.matches.length) {
      e.preventDefault();
      chooseSuggestion(Math.max(0, suggestions.index));
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
    const column = e.key === "Home" ? columnOrder(grid)[0] : columnOrder(grid).at(-1);
    focusCell(grid, i, column);
    const input = document.activeElement,
      position = e.key === "Home" ? 0 : input.value.length;
    if (input.setSelectionRange) input.setSelectionRange(position, position);
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
    ((e.key === "ArrowLeft" &&
      ((e.target.tagName === "SUMMARY" || e.target.tagName === "SELECT") || e.target.selectionStart === 0)) ||
      (e.key === "ArrowRight" &&
        ((e.target.tagName === "SUMMARY" || e.target.tagName === "SELECT") ||
          e.target.selectionStart === e.target.value?.length)))
  ) {
    e.preventDefault();
    focusCell(
      grid,
      i,
      columnOrder(grid)[
        Math.max(
          0,
          Math.min(
            columnOrder(grid).length - 1,
            columnOrder(grid).indexOf(c) + (e.key === "ArrowRight" ? 1 : -1),
          ),
        )
      ],
    );
  }
  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
    if (e.target.tagName === "SELECT" || e.target.tagName === "SUMMARY") return;
    e.preventDefault();
    if (i === rows(grid).length - 1) add(grid);
    else focusCell(grid, i + 1, c);
  }
  if (e.key === "Tab") {
    const count = columnOrder(grid).length;
    const next =
      i * count + columnOrder(grid).indexOf(c) + (e.shiftKey ? -1 : 1);
    if (next < 0) return;
    e.preventDefault();
    if (next >= rows(grid).length * count) add(grid);
    else
      focusCell(
        grid,
        Math.floor(next / count),
        columnOrder(grid)[next % count],
      );
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
          normalize(t.name) === normalize(source.name) &&
          (t.projectId || "") === (source.projectId || ""),
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
  if (view !== "day" || mode === "actual" || document.querySelector("dialog[open]")) return;
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
    confirmDeleteRows();
  }
  if (e.key === "Escape") {
    document.querySelectorAll(".plan-priority[open]").forEach((menu) => {
      menu.open = false;
      menu.querySelector("summary").focus();
    });
    closeSuggestions();
    clearSelection();
  }
});
for (const type of ["copy", "cut"])
  document.addEventListener(type, (e) => {
    if (view !== "day" || mode === "actual" || !selection.indices.size) return;
    e.preventDefault();
    const grid = selection.grid,
      picked = rows(grid).filter((_, i) => selection.indices.has(i));
    e.clipboardData.setData(
      "application/x-jornada",
      JSON.stringify({
        grid,
        rows: grid === 'tasks' ? picked.map(t => ({...t,start:taskValue(t,'start'),end:taskValue(t,'end')})) : picked,
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
          (grid === 'tasks' ? ['code','name','estimate','start','end','projectId'] : fields[grid])
            .map((field) =>
              (field === "refs"
                ? blockReferences(r)
                : field === "projectId"
                  ? data.projects?.find((p) => p.id === r.projectId)?.name || ""
                  : grid === 'tasks' ? taskValue(r,field) : r[field] || ""
              ).replace(/[\t\r\n]/g, " "),
            )
            .join("\t"),
        )
        .join("\n"),
    );
    if (type === "cut") deleteRows(false);
  });
document.addEventListener("paste", (e) => {
  if (view !== "day" || mode === "actual" || !doc()) return;
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
        (+e.target.dataset.col === columnOrder(grid).at(-1) &&
        (e.target.tagName === "SELECT" || (e.target.value?.length &&
        e.target.selectionStart === e.target.value.length))
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
          (grid === 'tasks' && !/^\d{1,2}:\d{2}$/.test(values[1] || '') ? (values.length >= 6 ? ['code','name','estimate','start','end','projectId'] : ['code','name','start','end','projectId']) : fields[grid]).forEach((field, i) => {
            if (values[i] === undefined) return;
            if (field === "projectId")
              r.projectId =
                data.projects?.find(
                  (p) => normalize(p.name) === normalize(values[i]),
                )?.id || "";
            else if (field === "refs") setReferences(r, values[i]);
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
        if (t.start && !parsed?.cut) {
          const start = parseTimeInput(t.start,true);
          const end = parseTimeInput(t.end || '',true);
          if (start && end && minutes(end)>minutes(start)) {
            t.estimate = time(minutes(end)-minutes(start));
            doc().blocks.push({...block(),taskIds:[t.id],start,end,description:t.name});
          }
        }
        delete t.start;
        delete t.end;
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
  if (!localMode) await ensureSession();
  data = prepareData(await repo.load());
  render();
} catch {
  document.querySelector("#app").innerHTML =
    `<main><h1>No pudimos leer tus datos</h1><p>${localMode ? "Los datos locales se conservaron en jornada.v1." : "No se pudieron cargar los datos del servidor. Verificá que esté iniciado y recargá. No se modificaron los datos guardados."}</p></main>`;
}
