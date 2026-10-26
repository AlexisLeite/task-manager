export const uid = () => crypto.randomUUID();
export const normalize = (value) => value.trim().toLocaleLowerCase();
export const minutes = (value) =>
  /^\d{1,2}:[0-5]\d$/.test(value)
    ? Number(value.split(":")[0]) * 60 + Number(value.split(":")[1])
    : NaN;
export const clock = (value) =>
  Number.isFinite(minutes(value)) && minutes(value) < 1440;
export const duration = (block) =>
  clock(block.start) && (clock(block.end) || block.end === "24:00")
    ? Math.max(0, minutes(block.end) + (block.endDay || 0) * 1440 - minutes(block.start))
    : 0;
export const format = (n) =>
  `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
export const time = (n) => format(n).padStart(5, "0");
export const document = () => ({
  title: "Jornada de hoy",
  intro: "",
  tasks: [],
  blocks: [],
});
export const block = () => ({
  id: uid(),
  taskIds: [],
  description: "",
  start: "",
  end: "",
});
export function nextCode(tasks) {
  let n = 1;
  while (tasks.some((t) => t.code === `t${n}`)) n++;
  return `t${n}`;
}
export const task = (tasks) => ({
  id: uid(),
  taskId: uid(),
  code: nextCode(tasks),
  estimate: "",
  priority: "Baja",
  projectId: "",
  name: "",
});
export function union(blocks) {
  let end = 0,
    total = 0;
  for (const [a, b] of blocks
    .filter(duration)
    .map((b) => [minutes(b.start), Math.min(1440, minutes(b.end) + (b.endDay || 0) * 1440)])
    .sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, b - Math.max(end, a));
    end = Math.max(end, b);
  }
  return total;
}
export const resolved = (doc, b) =>
  doc.tasks.filter((t) => b.taskIds.includes(t.id));
export function syncPlan(doc) {
  const ids = new Set(doc.tasks.map((t) => t.id));
  doc.blocks = doc.blocks
    .map((b) => ({ ...b, taskIds: b.taskIds.filter((id) => ids.has(id)) }))
    .filter((b) => b.taskIds.length || b.refsText);
  const unique = [];
  for (const b of doc.blocks) {
    const key = [...new Set(b.taskIds)].sort().join("|");
    const match = unique.findIndex(
      (other) =>
        !b.intentionalRepeat &&
        !other.intentionalRepeat &&
        !b.refsText &&
        !other.refsText &&
        [...new Set(other.taskIds)].sort().join("|") === key &&
        ((!b.start && !b.end) ||
          (!other.start && !other.end) ||
          (b.start === other.start && b.end === other.end)),
    );
    if (match < 0) {
      unique.push(b);
      continue;
    }
    const old = unique[match],
      keepNew = !old.start && !old.end && (b.start || b.end);
    (doc.recoveredBlocks ||= []).push(structuredClone(keepNew ? old : b));
    if (keepNew) unique[match] = b;
  }
  doc.blocks = unique;
  const present = new Set(doc.blocks.flatMap((b) => b.taskIds));
  for (const t of doc.tasks)
    if (!present.has(t.id))
      doc.blocks.push({
        ...block(),
        taskIds: [t.id],
        description: t.name,
        autoAdded: true,
      });
  for (const b of doc.blocks) {
    const description = resolved(doc, b)
      .map((t) => t.name)
      .join(" / ");
    if (
      b.descriptionSource !== "tasks" &&
      b.description &&
      b.description !== description
    )
      b.previousDescription = b.description;
    b.descriptionSource = "tasks";
    b.description = description;
  }
}
export function parseTimeInput(raw, isClock = false, allowMidnight = false) {
  raw = raw.trim();
  if (!raw) return "";
  let value;
  if (/^\d{1,2}$/.test(raw)) value = raw.padStart(2, "0") + ":00";
  else if (/^\d{3,4}$/.test(raw))
    value = raw.slice(0, -2).padStart(2, "0") + ":" + raw.slice(-2);
  else if (/^\d{1,2}:[0-5]\d$/.test(raw)) value = raw.padStart(5, "0");
  else return null;
  if (!/^\d{2}:[0-5]\d$/.test(value) || (isClock && !clock(value) && !(allowMidnight && value === "24:00"))) return null;
  return value;
}
export function normalizePriority(value) {
  if (["Baja", "Media", "Alta"].includes(value)) return value;
  if (/p1/i.test(value)) return "Alta";
  if (/p3/i.test(value)) return "Baja";
  return "Media";
}
export function normalizeDocument(doc) {
  for (const t of doc.tasks) {
    t.projectId ||= "";
    t.priority = normalizePriority(t.priority);
    t.estimate = Number.isFinite(minutes(t.estimate))
      ? time(minutes(t.estimate))
      : "";
  }
  syncPlan(doc);
}
export function durationDraft(raw) {
  if (!/^[0-9:]*$/.test(raw) || raw.length > 5 || raw.split(":").length > 2)
    return null;
  let value = raw;
  if (/^\d:\d{2}$/.test(value)) value = "0" + value;
  if (!value.includes(":") && value.length > 2)
    value = value.slice(0, 2) + ":" + value.slice(2);
  if (!/^\d{0,2}(:[0-5]?\d?)?$/.test(value)) return null;
  return value;
}
export const references = (doc, b) =>
  b.taskIds
    .map((id) => doc.tasks.find((t) => t.id === id)?.code || "?")
    .join(",");
export function totals(doc) {
  return {
    work: union(
      doc.blocks.filter((b) => !b.refsText && resolved(doc, b).length),
    ),
  };
}
export function registerTasks(data, doc) {
  const ids = new Set(doc.blocks.filter(duration).flatMap((b) => b.taskIds));
  for (const t of doc.tasks) {
    if (!ids.has(t.id) || !t.name.trim()) continue;
    let known = data.tasks.find(
      (k) =>
        normalize(k.name) === normalize(t.name) &&
        (k.projectId || "") === (t.projectId || ""),
    );
    if (!known) {
      known = {
        id: data.tasks.some((k) => k.id === t.taskId)
          ? uid()
          : t.taskId || uid(),
        name: t.name.trim(),
        projectId: t.projectId || "",
      };
      data.tasks.push(known);
    }
    t.taskId = known.id;
  }
}
export function example() {
  const doc = document();
  doc.intro =
    "En st: De 11 a 12:30\n\nMe quedan por hacer 6:30 hs\n\nSon las 2:30, debo trabajar hasta las 21.";
  doc.tasks = [
    ["2:00", "", "Instalar el centro de decisiones"],
    ["2:30", "(P1)", "Avanzar con la matriz de casos"],
    ["2:30", "(P1)", "Preparar modelo de dominio para casos de ejemplo"],
    ["1:30", "", "Escribir reglas a mano 1:30hs mínimo"],
    ["0:30", "", "Descanso"],
  ].map(([estimate, priority, name], i) => ({
    ...task([]),
    code: `t${i + 1}`,
    estimate,
    priority,
    name,
  }));
  doc.blocks = [
    [[0], "Centro de decisiones", "14:30", "16:30"],
    [[1, 2], "Paralelo t2 y t3", "16:30", "19:00"],
    [[4], "Descanso", "19:00", "19:30"],
    [[3], "Escribir reglas", "19:30", "21:00"],
  ].map(([ids, description, start, end]) => ({
    ...block(),
    taskIds: ids.map((i) => doc.tasks[i].id),
    description,
    start,
    end,
  }));
  normalizeDocument(doc);
  return doc;
}
export function migrate(data) {
  if (data.version !== 1) return data;
  const convert = (rows) => {
    const doc = document();
    for (const r of rows) {
      const t = {
        ...task(doc.tasks),
        name: r.name,
        taskId: r.taskId || uid(),
        estimate: format(duration(r)),
        kind: r.kind,
      };
      doc.tasks.push(t);
      doc.blocks.push({
        ...block(),
        taskIds: [t.id],
        description: r.notes || r.name,
        start: r.start,
        end: r.end,
      });
    }
    return doc;
  };
  return {
    version: 2,
    tasks: data.tasks,
    days: Object.fromEntries(
      Object.entries(data.days).map(([date, d]) => [
        date,
        {
          plan: convert(d.plan),
          actual: d.actual === null ? null : convert(d.actual),
        },
      ]),
    ),
  };
}
export function validate(data) {
  if (
    data?.version !== 2 ||
    !data.days ||
    typeof data.days !== "object" ||
    Array.isArray(data.days) ||
    !Array.isArray(data.tasks)
  )
    throw Error("Formato inválido");
  if (
    data.tasks.some(
      (t) => typeof t.id !== "string" || typeof t.name !== "string",
    )
  )
    throw Error("Catálogo inválido");
  const projects = data.projects || [];
  if (
    !Array.isArray(projects) ||
    projects.some(
      (p) =>
        !p ||
        typeof p.id !== "string" ||
        !p.id ||
        typeof p.name !== "string" ||
        !p.name.trim() ||
        p.name.length > 120,
    ) ||
    new Set(projects.map((p) => p.id)).size !== projects.length ||
    new Set(projects.map((p) => normalize(p.name))).size !== projects.length
  )
    throw Error("Proyectos inválidos");
  const projectIds = new Set(projects.map((p) => p.id));
  const validProject = (t) =>
    t.projectId === undefined ||
    t.projectId === "" ||
    (typeof t.projectId === "string" && projectIds.has(t.projectId));
  if (!data.tasks.every(validProject)) throw Error("Proyecto inválido");
  const backlog = data.backlog || [];
  if (!Array.isArray(backlog) || backlog.some(t =>
    !t || !['id','taskId','name','estimate'].every(k => typeof t[k] === 'string') ||
    !t.id || !validProject(t) ||
    (t.estimate !== '' && !Number.isFinite(minutes(t.estimate)))
  ) || new Set(backlog.map(t => t.id)).size !== backlog.length)
    throw Error("Backlog inválido");
  for (const [date, day] of Object.entries(data.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day.plan)
      throw Error("Jornada inválida");
    for (const doc of [day.plan, day.actual]) {
      if (doc === null) continue;
      if (
        !doc ||
        typeof doc.title !== "string" ||
        typeof doc.intro !== "string" ||
        !Array.isArray(doc.tasks) ||
        !Array.isArray(doc.blocks)
      )
        throw Error("Documento inválido");
      if (
        doc.tasks.some(
          (t) =>
            !["id", "taskId", "code", "estimate", "priority", "name"].every(
              (k) => typeof t[k] === "string",
            ),
        )
      )
        throw Error("Tarea inválida");
      if (!doc.tasks.every(validProject)) throw Error("Proyecto inválido");
      const ids = new Set(doc.tasks.map((t) => t.id));
      if (ids.size !== doc.tasks.length) throw Error("Identidad duplicada");
      if (
        doc.blocks.some(
          (b) =>
            !["id", "description", "start", "end"].every(
              (k) => typeof b[k] === "string",
            ) ||
            !Array.isArray(b.taskIds) ||
            b.taskIds.some((id) => !ids.has(id)),
        )
      )
        throw Error("Bloque inválido");
    }
  }
}
