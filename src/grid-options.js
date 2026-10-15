let closeActive;
export function openGridOptions(trigger, query = '') {
  closeActive?.();
  const select = trigger.tagName === 'SELECT';
  const menu = trigger.closest('details');
  if (menu) menu.open = false;
  const options = select
    ? [...trigger.options].map(option => ({ label: option.text, choose: () => { trigger.value = option.value; trigger.dispatchEvent(new Event('input', { bubbles: true })); trigger.dispatchEvent(new Event('change', { bubbles: true })); } }))
    : [...menu.querySelectorAll('[data-plan-priority]')].map(button => ({ label: button.textContent.trim(), choose: () => button.click() }));
  const popup = document.createElement('div');
  popup.className = 'grid-options';
  popup.setAttribute('popover', 'manual');
  const input = document.createElement('input');
  input.placeholder = 'Filtrar opciones…';
  input.setAttribute('aria-label', 'Filtrar opciones');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'grid-options-list');
  const list = document.createElement('div');
  list.id = 'grid-options-list';
  list.setAttribute('role', 'listbox');
  popup.append(input, list);
  document.body.append(popup);
  popup.showPopover();
  trigger.setAttribute('aria-expanded', 'true');
  const rect = trigger.getBoundingClientRect();
  popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 248))}px`;
  popup.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - 260))}px`;
  const controller = new AbortController();
  let matches = [], index = 0;
  const close = (focus = false) => {
    controller.abort();
    popup.remove();
    trigger.setAttribute('aria-expanded', 'false');
    closeActive = null;
    if (focus && trigger.isConnected) trigger.focus();
  };
  closeActive = close;
  const choose = option => { close(); option.choose(); if (trigger.isConnected) trigger.focus(); };
  const render = () => {
    list.replaceChildren();
    matches.forEach((option, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.id = `grid-choice-${i}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(i === index));
      button.onmousedown = event => event.preventDefault();
      button.onclick = () => choose(option);
      list.append(button);
    });
    input.setAttribute('aria-activedescendant', matches.length ? `grid-choice-${index}` : '');
    list.children[index]?.scrollIntoView({ block: 'nearest' });
    if (!matches.length) list.textContent = 'Sin coincidencias';
  };
  input.oninput = () => {
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    matches = options.filter(option => normalize(option.label).includes(normalize(input.value)));
    index = 0;
    render();
  };
  input.onkeydown = event => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) event.preventDefault();
    if (event.key === 'Escape') close(true);
    else if (event.key === 'Tab') close();
    else if (event.key === 'Enter' && matches[index]) choose(matches[index]);
    else if (['ArrowDown', 'ArrowUp'].includes(event.key) && matches.length) {
      index = (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      render();
    }
  };
  document.addEventListener('pointerdown', event => { if (!popup.contains(event.target)) close(); }, { capture: true, signal: controller.signal });
  input.value = query;
  input.oninput();
  input.focus();
}
