import { confirmTaskDeletion } from "./task-confirmation.js";
import autoAnimate from "@formkit/auto-animate";
import { task, parseTimeInput, normalize } from "./model.js";
import { projectOptions } from "./projects.js";
import { timeFieldAttributes } from "./time-field.js";
import { openGridOptions } from "./grid-options.js";
import "./backlog.css";

const fields = ["name", "projectId", "estimate"];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const rowHtml = (
  data,
  t,
) => `<tr data-backlog-id="${esc(t.id)}" aria-selected="false">
  <td><input data-backlog-field="name" aria-label="Descripción de tarea" value="${esc(t.name)}" autocomplete="off"></td>
  <td><select data-backlog-field="projectId" aria-label="Proyecto de tarea">${projectOptions(data, t.projectId)}</select></td>
  <td class="hours"><input data-backlog-field="estimate" aria-label="Duración de tarea" value="${esc(t.estimate)}" ${timeFieldAttributes(false)}></td>
  <td><div class="task-row-actions">
  <button data-backlog-play aria-label="Iniciar ${esc(t.name || "tarea")}" title="Iniciar en Jornada" ${t.name.trim() ? "" : "disabled"}><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg></button>
  <button data-backlog-remove class="delete-task" aria-label="Eliminar ${esc(t.name || "tarea")}" title="Eliminar tarea"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg></button>
</div></td>
</tr>`;

export function backlogHtml(data) {
  return `<section class="backlog-view" aria-label="Backlog"><div class="grid-scroll"><table class="backlog-grid" aria-label="Tareas del backlog">
    <colgroup><col><col class="project-col"><col class="estimate-col"><col class="backlog-actions-col"></colgroup><thead><tr><th>Tarea</th><th>Proyecto</th><th>Duración</th><th aria-label="Acciones"></th></tr></thead>
    <tbody id="backlog-list">${(data.backlog || []).map((t) => rowHtml(data, t)).join("")}</tbody></table></div>
    <button class="add" id="backlog-add">+ Tarea</button></section>`;
}

export function bindBacklog(data, checkpoint, save, start, undo, notice) {
  const add = document.querySelector("#backlog-add");
  if (!add) return;
  const list = document.querySelector("#backlog-list");
  const table = list.closest("table");
  autoAnimate(list, { duration: 200 });
  let selected = new Set(),
    anchor = 0;
  const entries = () => (data.backlog ||= []);
  const rowNodes = () =>
    [...list.querySelectorAll("tr[data-backlog-id]")].filter((row) =>
      entries().some((entry) => entry.id === row.dataset.backlogId),
    );
  const focus = (i, c = 0) =>
    rowNodes()
      [Math.max(0, Math.min(entries().length - 1, i))]?.querySelector(
        `[data-backlog-field="${fields[c]}"]`,
      )
      ?.focus();
  const select = (i, extend = false) => {
    if (!extend) anchor = i;
    selected = new Set(
      Array.from(
        { length: Math.abs(i - anchor) + 1 },
        (_, n) => entries()[Math.min(i, anchor) + n]?.id,
      ),
    );
    rowNodes().forEach((row) => {
      row.classList.toggle("selected", selected.has(row.dataset.backlogId));
      row.setAttribute(
        "aria-selected",
        String(selected.has(row.dataset.backlogId)),
      );
    });
  };
  const clear = () => {
    selected.clear();
    rowNodes().forEach((row) => {
      row.classList.remove("selected");
      row.setAttribute("aria-selected", "false");
    });
  };
  const append = () => {
    const entry = task([]);
    entries().push(entry);
    list.insertAdjacentHTML("beforeend", rowHtml(data, entry));
    return entry;
  };
  const addRow = () => {
    checkpoint();
    clear();
    append();
    focus(entries().length - 1);
    save();
  };
  add.onclick = addRow;
  const syncActions = (row, entry) => {
    const play = row.querySelector("[data-backlog-play]");
    play.disabled = !entry.name.trim();
    play.setAttribute("aria-label", `Iniciar ${entry.name || "tarea"}`);
    row
      .querySelector("[data-backlog-remove]")
      .setAttribute("aria-label", `Eliminar ${entry.name || "tarea"}`);
  };
  const update = (input) => {
    const row = input.closest("[data-backlog-id]");
    const entry = entries().find((t) => t.id === row?.dataset.backlogId);
    const field = input.dataset.backlogField;
    if (!entry || !field) return;
    const value =
      field === "estimate" ? parseTimeInput(input.value, false) : input.value;
    if (value === null) {
      input.value = entry[field];
      return;
    }
    if (value !== entry[field]) {
      checkpoint();
      entry[field] = value;
      syncActions(row, entry);
      save();
    }
    if (field === "estimate") input.value = value;
  };
  const remove = (ids) => {
    checkpoint();
    const first = entries().findIndex((t) => ids.has(t.id));
    const removed = rowNodes().filter((row) => ids.has(row.dataset.backlogId));
    data.backlog = entries().filter((t) => !ids.has(t.id));
    removed.forEach((row) => row.remove());
    clear();
    if (entries().length) focus(Math.min(first, entries().length - 1));
    else add.focus();
    save();
  };
  const confirmRemove = (ids) => {
    const picked = new Set(ids);
    confirmTaskDeletion({
      names: entries()
        .filter((t) => picked.has(t.id))
        .map((t) => t.name || "Tarea sin descripción"),
      message:
        "Se quitará del backlog. La planificación y las horas realizadas se conservan.",
      onConfirm: () => remove(picked),
    });
  };
  list.addEventListener("input", (event) => {
    const input = event.target;
    if (input.dataset.backlogField === "estimate") {
      const entry = entries().find(
        (t) => t.id === input.closest("tr").dataset.backlogId,
      );
      const draft = input.value;
      if (
        !/^[0-9:]*$/.test(draft) ||
        draft.length > 5 ||
        draft.split(":").length > 2
      )
        input.value = input.dataset.draft ?? entry.estimate;
      else {
        input.value = draft;
        input.dataset.draft = draft;
      }
      if (
        !input.value ||
        /^\d{1,2}:[0-5]\d$/.test(input.value) ||
        /^\d{4}$/.test(input.value)
      )
        update(input);
    } else update(input);
  });
  list.addEventListener("change", (event) => update(event.target));
  list.addEventListener("focusout", (event) => {
    if (event.target.dataset.backlogField === "estimate") update(event.target);
  });
  list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-backlog-id]");
    const entry = entries().find((t) => t.id === row?.dataset.backlogId);
    if (!entry) return;
    if (event.target.closest("[data-backlog-play]") && entry.name.trim())
      start(entry);
    if (event.target.closest("[data-backlog-remove]"))
      confirmRemove(new Set([entry.id]));
    if (event.target.tagName === "TD")
      select(entries().indexOf(entry), event.shiftKey);
  });
  table.addEventListener("keydown", (event) => {
    const input = event.target,
      field = input.dataset.backlogField;
    const row = input.closest("[data-backlog-id]");
    const i = entries().findIndex((t) => t.id === row?.dataset.backlogId),
      c = fields.indexOf(field);
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (mod && ["z", "y"].includes(key.toLowerCase())) {
      event.preventDefault();
      const id = row?.dataset.backlogId;
      undo(key.toLowerCase() === "y" || event.shiftKey);
      const controls = [
        ...document.querySelectorAll(
          `[data-backlog-field="${field || "name"}"]`,
        ),
      ];
      (
        controls.find((el) => el.closest("tr").dataset.backlogId === id) ||
        controls[Math.min(i, controls.length - 1)]
      )?.focus();
      return;
    }
    if (mod && key === "Enter") {
      event.preventDefault();
      addRow();
      return;
    }
    if (key === "Escape") {
      clear();
      return;
    }
    if (selected.size && ["Delete", "Backspace"].includes(key)) {
      event.preventDefault();
      confirmRemove(selected);
      return;
    }
    if (i < 0 || c < 0) return;
    if (event.shiftKey && event.code === "Space") {
      event.preventDefault();
      select(i);
      return;
    }
    if (mod && key.toLowerCase() === "a" && selected.size) {
      event.preventDefault();
      anchor = 0;
      select(entries().length - 1, true);
      return;
    }
    if (
      input.tagName === "SELECT" &&
      !mod &&
      !event.altKey &&
      (key === "Enter" || key.length === 1)
    ) {
      event.preventDefault();
      openGridOptions(input, key === "Enter" ? "" : key);
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      update(input);
      if (i === entries().length - 1 && !event.shiftKey) {
        checkpoint();
        append();
        save();
      }
      focus(i + (event.shiftKey ? -1 : 1), c);
      return;
    }
    if (["Home", "End"].includes(key)) {
      event.preventDefault();
      focus(
        mod ? (key === "Home" ? 0 : entries().length - 1) : i,
        key === "Home" ? 0 : 2,
      );
      return;
    }
    if (["ArrowUp", "ArrowDown"].includes(key)) {
      event.preventDefault();
      const n = Math.max(
        0,
        Math.min(entries().length - 1, i + (key === "ArrowDown" ? 1 : -1)),
      );
      if (event.altKey && n !== i) {
        checkpoint();
        const [entry] = entries().splice(i, 1);
        entries().splice(n, 0, entry);
        const node = rowNodes()[i],
          target = rowNodes()[n];
        list.insertBefore(node, n < i ? target : target.nextSibling);
        save();
      }
      focus(n, c);
      if (event.shiftKey) {
        if (!selected.size) anchor = i;
        select(n, true);
      } else clear();
      return;
    }
    if (["ArrowLeft", "ArrowRight"].includes(key)) {
      const boundary =
        input.tagName === "SELECT" ||
        (input.selectionStart === input.selectionEnd &&
          (key === "ArrowLeft"
            ? input.selectionStart === 0
            : input.selectionEnd === input.value.length));
      if (boundary || (mod && event.shiftKey)) {
        event.preventDefault();
        focus(i, Math.max(0, Math.min(2, c + (key === "ArrowRight" ? 1 : -1))));
      }
    }
  });
  for (const type of ["copy", "cut"])
    table.addEventListener(type, (event) => {
      if (!selected.size) return;
      event.preventDefault();
      const picked = entries().filter((t) => selected.has(t.id));
      event.clipboardData.setData(
        "text/plain",
        picked
          .map((t) =>
            [
              t.name,
              data.projects?.find((p) => p.id === t.projectId)?.name || "",
              t.estimate,
            ].join("\t"),
          )
          .join("\n"),
      );
      if (type === "cut") remove(selected);
    });
  table.addEventListener("paste", (event) => {
    const input = event.target,
      c = fields.indexOf(input.dataset.backlogField);
    const raw = event.clipboardData.getData("text/plain");
    if (c < 0 || !/[\t\n]/.test(raw)) return;
    event.preventDefault();
    const values = raw
      .replace(/\r/g, "")
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => line.split("\t").slice(0, 3 - c));
    // Validate all cells before mutating the document.
    for (const cells of values)
      for (const [offset, value] of cells.entries()) {
        const field = fields[c + offset];
        if (field === "estimate" && parseTimeInput(value, false) === null) {
          notice("Duración inválida. Usá hh:mm.");
          return;
        }
        if (
          field === "projectId" &&
          value &&
          normalize(value) !== "sin proyecto" &&
          !data.projects?.some(
            (p) => p.id === value || normalize(p.name) === normalize(value),
          )
        ) {
          notice(`Proyecto desconocido: ${value}`);
          return;
        }
      }
    const i = entries().findIndex(
      (t) => t.id === input.closest("tr").dataset.backlogId,
    );
    checkpoint();
    values.forEach((cells, offset) => {
      const entry = entries()[i + offset] || append(),
        row = rowNodes()[i + offset];
      cells.forEach((value, n) => {
        const field = fields[c + n];
        entry[field] =
          field === "estimate"
            ? parseTimeInput(value, false)
            : field === "projectId"
              ? data.projects?.find(
                  (p) =>
                    p.id === value || normalize(p.name) === normalize(value),
                )?.id || ""
              : value;
        row.querySelector(`[data-backlog-field="${field}"]`).value =
          entry[field];
      });
      syncActions(row, entry);
    });
    save();
    focus(i, c);
  });
}

export function completeBacklog(data, task) {
  if (task.backlogId)
    data.backlog = (data.backlog || []).filter((t) => t.id !== task.backlogId);
}
