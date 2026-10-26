import autoAnimate from "@formkit/auto-animate";
import { alignHistoryPixels } from './chart-pixels.js';
import { historyMatches, historyHtml } from "./history.js";

const transitions = new WeakMap();

function reveal(element, visible) {
  const previous = transitions.get(element);
  if (!previous && element.hidden === !visible) return;
  const startHeight = element.hidden
    ? 0
    : element.getBoundingClientRect().height;
  previous?.cancel();
  element.hidden = false;
  element.inert = !visible;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.hidden = !visible;
    transitions.delete(element);
    return;
  }
  // Only the outer panel changes height. Its contents keep their natural size
  // and are progressively revealed, while the following sections move with it.
  const endHeight = visible ? element.getBoundingClientRect().height : 0;
  const animation = element.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    { duration: 280, easing: "cubic-bezier(.4, 0, .2, 1)" },
  );
  transitions.set(element, animation);
  animation.onfinish = () => {
    element.hidden = !visible;
    transitions.delete(element);
  };
}

export function bindHistoryControls(filters, data, openDay) {
  alignHistoryPixels();
  const filterToggle = document.getElementById("history-filter-toggle");
  if (!filterToggle) return;
  filterToggle.onclick = () => {
    filters.showDates = !filters.showDates;
    reveal(document.getElementById("history-date-filters"), filters.showDates);
    filterToggle.setAttribute("aria-expanded", String(filters.showDates));
  };
  const searchToggle = document.getElementById("history-search-toggle");
  const searchInput = document.getElementById("history-search");
  const searchPanel = document.getElementById("history-search-panel");
  let body, rows, templates, visibleRows;
  const empty = document.getElementById("history-search-empty");
  const bindRows = (freshRows) => {
    body = document.querySelector(".history-view .report tbody");
    rows = freshRows || [...body.children];
    rows.filter((row) => row.hidden).forEach((row) => row.remove());
    rows.forEach((row) => (row.hidden = false));
    templates = rows.map((row) => row.cloneNode(true));
    visibleRows = new Map(
      rows
        .filter((row) => row.parentElement === body)
        .map((row) => [row.dataset.historyTask, row]),
    );
    autoAnimate(body, { duration: 200 });
  };
  bindRows();
  const regions = [".history-chart-region", ".history-view .day-list"];
  regions.forEach((selector) =>
    autoAnimate(document.querySelector(selector), { duration: 200 }),
  );
  const bindDays = () =>
    document
      .querySelectorAll(".history-view [data-date]")
      .forEach(
        (button) => (button.onclick = () => openDay(button.dataset.date)),
      );
  bindDays();
  const refresh = () => {
    const template = document.createElement("template");
    template.innerHTML = historyHtml(data, filters);
    for (const selector of regions) {
      const next = template.content.querySelector(selector);
      document.querySelector(selector).replaceChildren(...next.childNodes);
    }
    for (const selector of [
      "#history-actual",
      "#history-days",
      ".history-error",
    ]) {
      const next = template.content.querySelector(selector),
        current = document.querySelector(selector);
      current.textContent = next.textContent;
      current.hidden = next.hidden;
    }
    empty.hidden = template.content.querySelector(
      "#history-search-empty",
    ).hidden;
    filterToggle.textContent =
      filters.from || filters.to || filters.projectIds?.length
        ? "Filtros •"
        : "Filtros";
    const freshRows = [
      ...template.content.querySelector(".report tbody").children,
    ];
    body.replaceChildren(...freshRows);
    const oldEmpty = document.querySelector(".history-table-region > .empty");
    oldEmpty?.remove();
    const nextEmpty = template.content.querySelector(
      ".history-table-region > .empty",
    );
    if (nextEmpty)
      document.querySelector(".history-table-region").append(nextEmpty);
    bindRows(freshRows);
    bindDays();
  };
  for (const field of ["from", "to"])
    document.getElementById(`history-${field}`).onchange = (event) => {
      filters[field] = event.target.value;
      refresh();
    };
  const projectSelect=document.getElementById('history-project-select');
  projectSelect.onchange=()=>{
    filters.projectIds=[...projectSelect.selectedOptions].map(option=>option.value);
    refresh();
  };
  document.getElementById("history-clear").onclick = () => {
    Object.assign(filters, { from: "", to: "", projectIds: [] });
    for (const field of ["from", "to"])
      document.getElementById(`history-${field}`).value = "";
    for(const option of projectSelect.options) option.selected=false;
    projectSelect.dispatchEvent(new Event("input",{bubbles:true}));
    refresh();
  };
  const applySearch = () => {
    filters.query = searchInput.value;
    const matches = templates.filter((row) =>
      historyMatches(row.cells[0].textContent, filters.query),
    );
    const ids = new Set(matches.map((row) => row.dataset.historyTask));
    for (const id of visibleRows.keys())
      if (!ids.has(id)) visibleRows.delete(id);
    const displayed = matches.map((template) => {
      const id = template.dataset.historyTask;
      if (!visibleRows.has(id)) visibleRows.set(id, template.cloneNode(true));
      return visibleRows.get(id);
    });
    body.replaceChildren(...displayed);
    empty.hidden = !rows.length || matches.length > 0;
  };
  searchInput.oninput = applySearch;
  searchToggle.onclick = () => {
    filters.searchOpen = !filters.searchOpen;
    reveal(searchPanel, filters.searchOpen);
    searchToggle.setAttribute("aria-expanded", String(filters.searchOpen));
    if (filters.searchOpen) searchInput.focus({ preventScroll: true });
    else {
      searchInput.value = "";
      applySearch();
    }
  };
  searchInput.onkeydown = (event) => {
    if (event.key === "Escape") {
      searchToggle.click();
      searchToggle.focus();
    }
  };
}
