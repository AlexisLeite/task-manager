import { parseTimeInput } from './model.js';

export function timeFieldAttributes(isClock = true) {
  return `type="text" data-time-field="${isClock ? 'clock' : 'duration'}" inputmode="numeric" maxlength="5" pattern="[0-9]{2}:[0-5][0-9]" placeholder="hh:mm" autocomplete="off"`;
}

export function bindTimeFields(root = document) {
  const normalize = event => {
    const input = event.target;
    if (!input.matches?.('[data-time-field]')) return;
    const value = parseTimeInput(input.value, input.dataset.timeField === 'clock');
    if (value !== null) input.value = value;
  };
  root.addEventListener('blur', normalize, true);
  root.addEventListener('keydown', event => {
    if (event.key === 'Enter') normalize(event);
  }, true);
}
