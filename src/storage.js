// Replace this adapter with any implementation of async load() / save(document).
export class LocalStorageAdapter {
  constructor(key = "jornada.v1") {
    this.key = key;
  }
  async load() {
    const raw = localStorage.getItem(this.key);
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
