// Shared confirmation keeps keyboard and pointer behavior consistent in both grids.
export function confirmTaskDeletion({ names, message, onConfirm }) {
  const trigger = document.activeElement;
  let confirmed = false;
  const dialog = document.createElement("dialog");
  dialog.className = "task-dialog";
  dialog.dataset.gridAction = "delete";
  dialog.setAttribute("aria-label", "Eliminar tarea");
  dialog.innerHTML =
    '<form><h2></h2><p data-task-names></p><p data-message></p><div class="dialog-actions"><button type="button" data-dismiss>Cancelar</button><button type="submit" autofocus>Eliminar</button></div></form>';
  dialog.querySelector("h2").textContent =
    names.length === 1 ? "Eliminar tarea" : "Eliminar tareas";
  dialog.querySelector("[data-task-names]").textContent = names.join(", ");
  dialog.querySelector("[data-message]").textContent = message;
  dialog.querySelector("[data-dismiss]").onclick = () => dialog.close();
  dialog.onclick = (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  };
  dialog.onclose = () => {
    setTimeout(() => dialog.remove(), 200);
    if (!confirmed && trigger?.isConnected) trigger.focus();
  };
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    confirmed = true;
    dialog.close();
    onConfirm();
  };
  document.body.append(dialog);
  dialog.showModal();
  focusConfirmation(dialog);
}
function focusConfirmation(dialog) {
  const button = dialog.querySelector('button[type="submit"]');
  const controller = new AbortController();
  let interacted = false;
  const markInteraction = () => {
    interacted = true;
  };
  for (const event of ["pointerdown", "keydown"])
    dialog.addEventListener(event, markInteraction, {
      signal: controller.signal,
    });
  const focus = () => {
    if (dialog.open && button?.isConnected && !interacted)
      button.focus({ preventScroll: true });
  };
  focus();
  const frame = requestAnimationFrame(focus);
  const retry = setTimeout(focus, 200);
  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(frame);
      clearTimeout(retry);
      controller.abort();
    },
    { once: true },
  );
}
