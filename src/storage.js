// Replace this adapter with any implementation of async load() / save(document).
export class LocalStorageAdapter {
  constructor(key = "jornada.v1") {
    this.key = key;
  }
  async load() {
    const raw = localStorage.getItem(this.key);
    this.revision = raw;
    if (!raw) return { version: 2, days: {}, tasks: [] };
    const data = JSON.parse(raw);
    if (
      ![1, 2].includes(data.version) ||
      !data.days ||
      !Array.isArray(data.tasks)
    )
      throw new Error("Formato de datos no compatible");
    return data;
  }
  async save(data) {
    const previous = localStorage.getItem(this.key);
    if (
      previous &&
      data.syncRevision === 1 &&
      JSON.parse(previous).syncRevision !== 1 &&
      !localStorage.getItem("jornada.backup.before-sync")
    ) {
      localStorage.setItem("jornada.backup.before-sync", previous);
    }
    if (previous && JSON.parse(previous).version === 1 && data.version === 2) {
      localStorage.setItem("jornada.backup.v1", previous);
    }
    localStorage.setItem(this.key, JSON.stringify(data));
    this.revision = JSON.stringify(data);
  }
  async poll() {
    const raw = localStorage.getItem(this.key);
    return raw && raw !== this.revision
      ? { data: JSON.parse(raw), revision: raw }
      : null;
  }
}
function checkSession(response) {
  if (response.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new Event("worktrack:unauthorized"));
}
export class BackendAdapter {
  constructor(url = "/api/workspace") {
    this.url = url;
    this.revision = null;
  }
  async load() {
    const response = await fetch(this.url, { cache: "no-store" });
    checkSession(response);
    if (!response.ok) throw Error("No se pudo conectar con el servidor.");
    const data = await response.json();
    this.revision = response.headers.get("ETag");
    return data;
  }
  async save(data) {
    if (!this.revision)
      throw Error("Primero se deben cargar los datos del servidor.");
    const response = await fetch(this.url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": this.revision,
      },
      body: JSON.stringify(data),
    });
    checkSession(response);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Error(body.error || "No se pudo guardar en el servidor.");
    }
    this.revision = response.headers.get("ETag");
  }
  async poll() {
    const response = await fetch(this.url, {
      cache: "no-store",
      headers: { "If-None-Match": this.revision },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 304) return null;
    checkSession(response);
    if (!response.ok) throw Error("No se pudo consultar el servidor.");
    return {
      data: await response.json(),
      revision: response.headers.get("ETag"),
    };
  }
}
export class Repository {
  constructor(adapter) {
    this.adapter = adapter;
    this.pending = Promise.resolve();
  }
  load() {
    return this.adapter.load();
  }
  save(data) {
    const snapshot = structuredClone(data);
    this.pending = this.pending
      .catch(() => {})
      .then(() => this.adapter.save(snapshot));
    return this.pending;
  }
}
