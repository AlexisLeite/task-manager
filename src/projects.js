import { alphabetical } from "./option-order.js";
import autoAnimate from "@formkit/auto-animate";
import { uid, normalize } from "./model.js";
import "./projects.css";

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const projectRow = (project) =>
  `<li data-project-id="${esc(project.id)}"><span class="project-title">${esc(project.name)}</span><button class="project-edit" aria-label="Editar ${esc(project.name)}" title="Editar título"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/></svg></button></li>`;

export function projectsHtml(data) {
  return `<section class="projects-view" aria-label="Proyectos"><form id="project-add"><input id="project-name" aria-label="Nombre del proyecto" placeholder="Nombre del proyecto" autocomplete="off" required maxlength="120"><button type="submit">Agregar</button></form><ul id="project-list" aria-label="Mis proyectos">${[
    ...(data.projects || []),
  ]
    .sort((a, b) => alphabetical(a.name, b.name))
    .map(projectRow)
    .join(
      "",
    )}</ul><p id="projects-empty" class="empty" ${(data.projects || []).length ? "hidden" : ""}>Escribí un nombre y presioná Enter para agregar tu primer proyecto.</p></section>`;
}

export function bindProjects(data, checkpoint, save) {
  const form = document.getElementById("project-add");
  if (!form) return;
  const input = form.querySelector("input");
  const list = document.getElementById("project-list");
  autoAnimate(list, { duration: 200 });
  const sortRows = () => {
    const rows = new Map(
      [...list.children].map((row) => [row.dataset.projectId, row]),
    );
    for (const project of [...(data.projects || [])].sort((a, b) =>
      alphabetical(a.name, b.name),
    ))
      list.append(rows.get(project.id));
  };
  list.onclick = (event) => {
    const button = event.target.closest(".project-edit");
    if (!button) return;
    const row = button.closest("[data-project-id]");
    const project = data.projects.find(
      (item) => item.id === row.dataset.projectId,
    );
    if (!project) return;
    const title = row.querySelector(".project-title");
    const editor = document.createElement("input");
    editor.className = "project-title-editor";
    editor.value = project.name;
    editor.maxLength = 120;
    editor.setAttribute("aria-label", "Título del proyecto");
    title.replaceWith(editor);
    button.hidden = true;
    let closed = false;
    const finish = (cancel = false) => {
      if (closed) return;
      const name = editor.value.trim().replace(/\s+/g, " ");
      if (
        !cancel &&
        (!name ||
          data.projects.some(
            (item) =>
              item.id !== project.id &&
              normalize(item.name) === normalize(name),
          ))
      ) {
        editor.setCustomValidity(
          name ? "Ese proyecto ya existe." : "Escribí un nombre.",
        );
        editor.reportValidity();
        return;
      }
      closed = true;
      if (!cancel && name !== project.name) {
        checkpoint();
        project.name = name;
        save();
      }
      title.textContent = project.name;
      editor.replaceWith(title);
      button.setAttribute("aria-label", `Editar ${project.name}`);
      button.hidden = false;
      sortRows();
    };
    editor.oninput = () => editor.setCustomValidity("");
    editor.onblur = () => finish();
    editor.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      finish(event.key === "Escape");
      if (closed) button.focus();
    };
    editor.focus();
    editor.select();
  };
  input.oninput = () => input.setCustomValidity("");
  form.onsubmit = (event) => {
    event.preventDefault();
    const name = input.value.trim().replace(/\s+/g, " ");
    if (
      !name ||
      (data.projects || []).some(
        (project) => normalize(project.name) === normalize(name),
      )
    ) {
      input.setCustomValidity(
        name ? "Ese proyecto ya existe." : "Escribí un nombre.",
      );
      input.reportValidity();
      return;
    }
    checkpoint();
    const project = { id: uid(), name };
    (data.projects ||= []).push(project);
    list.insertAdjacentHTML("beforeend", projectRow(project));
    sortRows();
    document.getElementById("projects-empty").hidden = true;
    input.value = "";
    input.focus();
    save();
  };
}

export function projectOptions(data, selected = "") {
  return [{ id: "", name: "Sin proyecto" }, ...(data.projects || [])]
    .sort((a, b) => alphabetical(a.name, b.name))
    .map(
      (project) =>
        `<option value="${esc(project.id)}" ${project.id === selected ? "selected" : ""}>${esc(project.name)}</option>`,
    )
    .join("");
}
