import autoAnimate from "@formkit/auto-animate";
import { historyMatches } from "./history.js";

const transitions = new WeakMap();

function reveal(element, visible) {
  const previous = transitions.get(element);
  if (!previous && element.hidden === !visible) return;
  const before = getComputedStyle(element);
  const start = {
    height: `${element.getBoundingClientRect().height}px`,
    opacity: element.hidden ? 0 : before.opacity,
    marginTop: element.hidden ? "0px" : before.marginTop,
    marginBottom: element.hidden ? "0px" : before.marginBottom,
  };
  previous?.cancel();
  element.hidden = false;
  element.inert = !visible;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.hidden = !visible;
    transitions.delete(element);
    return;
  }
  const natural = getComputedStyle(element);
  const end = {
    height: visible ? `${element.getBoundingClientRect().height}px` : "0px",
    opacity: visible ? 1 : 0,
    marginTop: visible ? natural.marginTop : "0px",
    marginBottom: visible ? natural.marginBottom : "0px",
  };
  const animation = element.animate([start, end], {
    duration: 200,
    easing: "ease-out",
  });
  transitions.set(element, animation);
  animation.onfinish = () => {
    element.hidden = !visible;
    transitions.delete(element);
  };
}

export function bindHistoryControls(filters) {
  const filterToggle = document.getElementById("history-filter-toggle");
  if (!filterToggle) return;
  filterToggle.onclick = () => {
    filters.showDates = !filters.showDates;
    reveal(document.getElementById("history-date-filters"), filters.showDates);
    filterToggle.setAttribute("aria-expanded", String(filters.showDates));
  };
  const searchToggle = document.getElementById("history-search-toggle");
  const searchInput = document.getElementById("history-search");
  const body = document.querySelector(".history-view .report tbody");
  const rows = [...body.children];
  const empty = document.getElementById("history-search-empty");
  rows.filter((row) => row.hidden).forEach((row) => row.remove());
  rows.forEach((row) => (row.hidden = false));
  const templates = rows.map((row) => row.cloneNode(true));
  const visibleRows = new Map(
    [...body.children].map((row) => [row.dataset.historyTask, row]),
  );
  autoAnimate(body, { duration: 200 });
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
    reveal(empty, rows.length > 0 && matches.length === 0);
  };
  searchInput.oninput = applySearch;
  searchToggle.onclick = () => {
    filters.searchOpen = !filters.searchOpen;
    reveal(searchInput, filters.searchOpen);
    searchToggle.setAttribute("aria-expanded", String(filters.searchOpen));
    if (filters.searchOpen) searchInput.focus();
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
