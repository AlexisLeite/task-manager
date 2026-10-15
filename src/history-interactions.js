import autoAnimate from "@formkit/auto-animate";
import { historyMatches } from "./history.js";

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
  const searchPanel = document.getElementById("history-search-panel");
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
