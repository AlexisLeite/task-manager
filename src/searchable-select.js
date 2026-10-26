import React, { useRef, useState, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import Select, { components } from "react-select";
import "./searchable-select.css";

const mounted = new Map();
const valueDescriptor = Object.getOwnPropertyDescriptor(
  HTMLSelectElement.prototype,
  "value",
);
let serial = 0;
export const selectSource = (element) =>
  element?.closest?.(".searchable-select")?.querySelector("select") || element;

const DropdownIndicator = (props) =>
  React.createElement(
    components.DropdownIndicator,
    props,
    React.createElement(
      "svg",
      {
        width: 12,
        height: 12,
        viewBox: "0 0 16 16",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.5,
        "aria-hidden": true,
      },
      React.createElement("path", { d: "m4 6 4 4 4-4" }),
    ),
  );
const SummaryValue = (props) => {
  const selected = props.getValue();
  const label =
    selected.length === 0
      ? "Todos los proyectos"
      : selected.length === 1
        ? selected[0].label
        : `${selected.length} proyectos`;
  return React.createElement(
    components.ValueContainer,
    props,
    !props.selectProps.inputValue &&
      React.createElement("span", { className: "combo-summary" }, label),
    React.Children.toArray(props.children).at(-1),
  );
};
const PriorityValue = (props) =>
  React.createElement(
    components.SingleValue,
    props,
    React.createElement("span", {
      className: `priority-dot ${props.data.value.toLowerCase()}`,
      role: "img",
      "aria-label": `${props.selectProps.nativeSource.dataset.priorityCode}: ${props.data.value}`,
      title: props.data.label,
    }),
  );
const PriorityOption = (props) =>
  React.createElement(
    components.Option,
    props,
    React.createElement("span", {
      className: `priority-dot ${props.data.value.toLowerCase()}`,
    }),
    " ",
    props.data.label,
  );
const StatusValue = (props) =>
  React.createElement(
    components.SingleValue,
    props,
    React.createElement("span", {
      dangerouslySetInnerHTML: {
        __html: props.selectProps.nativeSource.dataset.statusIcon,
      },
    }),
  );
function SearchableSelect({ source, record }) {
  const ref = useRef();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  record.focus = () => ref.current?.focus();
  useLayoutEffect(() => {
    if (record.pendingFocus) {
      record.pendingFocus = false;
      ref.current?.focus();
    }
  }, []);
  const options = [...source.options].map((option) => ({
    value: option.value,
    label: option.text,
    disabled: option.disabled,
  }));
  const selected = source.multiple
    ? options.filter((option) =>
        [...source.selectedOptions].some((item) => item.value === option.value),
      )
    : options.find((option) => option.value === source.value) || null;
  const onKeyDown = (event) => {
    event.stopPropagation();
    if (open) return;
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (
      event.key.length === 1 &&
      !(event.shiftKey && event.code === "Space") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    )
      return;
    if (event.key === "Tab") return;
    const forwarded = new KeyboardEvent("keydown", {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      bubbles: true,
      cancelable: true,
    });
    source.dispatchEvent(forwarded);
    if (forwarded.defaultPrevented) event.preventDefault();
  };
  return React.createElement(Select, {
    ref,
    instanceId: record.id,
    inputId: `${record.id}-input`,
    classNamePrefix: "combo",
    unstyled: true,
    nativeSource: source,
    options,
    value: selected,
    isMulti: source.multiple,
    isSearchable: true,
    isClearable: false,
    isDisabled: source.disabled,
    isOptionDisabled: (option) => option.disabled,
    menuIsOpen: open,
    inputValue: query,
    onInputChange: (value, meta) => {
      setQuery(value);
      if (meta.action === "input-change") setOpen(true);
    },
    onMenuOpen: () => setOpen(true),
    onMenuClose: () => {
      setOpen(false);
      setQuery("");
    },
    onFocus: () => source.dispatchEvent(new FocusEvent("focus")),
    onBlur: () => {
      setOpen(false);
      setQuery("");
      source.dispatchEvent(new FocusEvent("blur"));
    },
    onKeyDown,
    tabSelectsValue: false,
    backspaceRemovesValue: false,
    closeMenuOnSelect: !source.multiple,
    hideSelectedOptions: false,
    controlShouldRenderValue: !query,
    onChange: (value) => {
      if (source.multiple) {
        for (const option of source.options)
          option.selected = (value || []).some(
            (item) => item.value === option.value,
          );
        record.render();
      } else source.value = value?.value ?? "";
      source.dispatchEvent(new Event("input", { bubbles: true }));
      source.dispatchEvent(new Event("change", { bubbles: true }));
    },
    components: {
      DropdownIndicator,
      IndicatorSeparator: null,
      ...(source.multiple ? { ValueContainer: SummaryValue } : {}),
      ...(source.hasAttribute("data-priority-control")
        ? { SingleValue: PriorityValue, Option: PriorityOption }
        : {}),
      ...(source.hasAttribute("data-status-icon")
        ? { SingleValue: StatusValue }
        : {}),
    },
    "aria-label": record.label,
    "aria-required": source.required || undefined,
    placeholder: source.dataset.placeholder || "Seleccionar…",
    noOptionsMessage: () => "Sin coincidencias",
    loadingMessage: () => "Cargando…",
    screenReaderStatus: ({ count }) => `${count} opciones disponibles`,
    menuPortalTarget: source.closest("dialog") || document.body,
    menuPosition: "fixed",
    styles: {
      menuPortal: (base) => ({
        ...base,
        zIndex: 10000,
        left: Math.min(
          Math.max(8, base.left),
          Math.max(8, window.innerWidth - Math.max(200, base.width) - 8),
        ),
      }),
      control: (base) => ({
        ...base,
        minHeight: 0,
        boxShadow: "none",
        cursor: "text",
      }),
      valueContainer: (base) => ({ ...base, padding: 0 }),
      input: (base) => ({ ...base, padding: 0, margin: 0, color: "inherit" }),
      singleValue: (base) => ({ ...base, color: "inherit", margin: 0 }),
      dropdownIndicator: (base) => ({ ...base, padding: 0, color: "inherit" }),
      clearIndicator: (base) => ({ ...base, padding: 0 }),
      option: (base) => ({ ...base, cursor: "pointer" }),
    },
  });
}

function mount(source) {
  if (mounted.has(source)) return;
  const host = document.createElement("span");
  host.className =
    "searchable-select" +
    (source.hasAttribute("data-priority-control")
      ? " priority-combo"
      : source.hasAttribute("data-status-icon")
        ? " status-combo"
        : "");
  const container = document.createElement("span");
  container.className = "combo-root";
  source.before(host);
  host.append(source, container);
  const record = {
    host,
    owner: source.closest("table") || source.closest("main") || document.body,
    root: createRoot(container),
    id: `searchable-${++serial}`,
    label:
      source.getAttribute("aria-label") ||
      source.labels?.[0]?.textContent ||
      "Seleccionar opción",
  };
  mounted.set(source, record);
  source.removeAttribute("aria-label");
  source.setAttribute("aria-hidden", "true");
  source.tabIndex = -1;
  source.classList.add("combo-source");
  record.render = () =>
    record.root.render(
      React.createElement(SearchableSelect, { source, record }),
    );
  Object.defineProperty(source, "value", {
    configurable: true,
    get() {
      return valueDescriptor.get.call(this);
    },
    set(value) {
      valueDescriptor.set.call(this, value);
      record.render();
    },
  });
  source.focus = () => {
    if (record.focus) record.focus();
    else record.pendingFocus = true;
  };
  source.addEventListener("input", record.render);
  source.addEventListener("change", record.render);
  record.render();
}
export function enhanceSelects(root = document) {
  root.querySelectorAll("select").forEach(mount);
}
const observer = new MutationObserver((mutations) => {
  for (const [source, record] of mounted)
    if (!source.isConnected && !record.owner.isConnected) {
      record.root.unmount();
      mounted.delete(source);
    }
  for (const mutation of mutations) {
    const source = mutation.target.closest?.("select");
    if (source && mounted.has(source)) mounted.get(source).render();
    for (const node of mutation.addedNodes)
      if (node.nodeType === 1) {
        if (node.matches("select")) mount(node);
        enhanceSelects(node);
      }
  }
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: [
    "selected",
    "disabled",
    "label",
    "multiple",
    "data-status-icon",
  ],
});
