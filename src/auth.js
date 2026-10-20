import autoAnimate from "@formkit/auto-animate";
import "./auth.css";

let currentUser, loginPending;
export const username = () => currentUser?.username || "";
export async function ensureSession() {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (response.ok) {
    currentUser = (await response.json()).user;
    return;
  }
  if (response.status !== 401) throw Error("No se pudo consultar la sesión.");
  return requestLogin();
}
function requestLogin() {
  if (loginPending) return loginPending;
  loginPending = new Promise(resolve => {
    const app = document.querySelector("#app");
    const previousFocus = document.activeElement;
    app.hidden = true;
    app.inert = true;
    const shell = document.createElement("main");
    shell.className = "auth-shell";
    shell.innerHTML = `<form class="auth-card"><h1>Work Track</h1><p>Iniciá sesión para continuar.</p><label>Usuario<input name="username" autocomplete="username" required autocapitalize="none" spellcheck="false"></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><div class="auth-feedback" aria-live="polite"></div><button type="submit">Iniciar sesión</button></form>`;
    app.before(shell);
    for (const type of ["keydown", "copy", "cut", "paste"])
      shell.addEventListener(type, event => event.stopPropagation());
    const form = shell.querySelector("form"), feedback = shell.querySelector(".auth-feedback");
    autoAnimate(feedback);
    form.elements.username.focus();
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const response = await fetch("/api/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: form.elements.username.value, password: form.elements.password.value }),
        });
        const body = await response.json();
        if (!response.ok) throw Error(body.error || "No se pudo iniciar sesión.");
        currentUser = body.user;
        form.reset();
        shell.remove();
        app.hidden = false;
        app.inert = false;
        if (previousFocus?.isConnected && app.contains(previousFocus)) previousFocus.focus();
        loginPending = null;
        resolve();
      } catch (error) {
        let message = feedback.querySelector("p");
        if (!message) { message = document.createElement("p"); message.setAttribute("role", "alert"); feedback.append(message); }
        message.textContent = error.message || "No se pudo conectar con el servidor.";
      } finally { button.disabled = false; }
    };
  });
  return loginPending;
}
window.addEventListener("worktrack:unauthorized", requestLogin);
export async function logout(repository) {
  await repository.pending;
  const response = await fetch("/api/logout", { method: "POST" });
  if (!response.ok) throw Error("No se pudo cerrar la sesión. Intentá de nuevo.");
  location.reload();
}
