import test from "node:test";
import assert from "node:assert/strict";
import { buildHistory } from "../src/history.js";
import { example, validate, registerTasks } from "../src/model.js";

const fixture = () => {
  const actual = example();
  actual.tasks[0].projectId = "a";
  actual.tasks[1].projectId = "a";
  actual.tasks[2].projectId = "b";
  return {
    version: 2,
    projects: [
      { id: "a", name: "Apia" },
      { id: "b", name: "CDD" },
    ],
    tasks: [],
    days: { "2026-10-15": { plan: structuredClone(actual), actual } },
  };
};
test("filtrar proyectos une intervalos paralelos y excluye tareas ajenas", () => {
  const data = fixture();
  const a = buildHistory(data, { projectIds: ["a"] });
  assert.equal(a.totalMinutes, 270);
  assert.equal(a.tasks.length, 2);
  const b = buildHistory(data, { projectIds: ["b"] });
  assert.equal(b.totalMinutes, 150);
  assert.equal(b.tasks.length, 1);
  const both = buildHistory(data, { projectIds: ["a", "b"] });
  assert.equal(both.totalMinutes, 270);
  assert.equal(both.tasks.length, 3);
  assert.equal(buildHistory(data, { projectIds: [""] }).totalMinutes, 120);
  assert.equal(
    buildHistory(data, { projectIds: ["a"], from: "2026-10-16" }).totalMinutes,
    0,
  );
  assert.equal(buildHistory(data).totalMinutes, 390);
});
test("el proyecto se conserva en el registro realizado aunque cambie el plan", () => {
  const data = fixture();
  data.days["2026-10-15"].plan.tasks[0].projectId = "b";
  assert.equal(buildHistory(data, { projectIds: ["a"] }).totalMinutes, 270);
});
test("catálogo distingue nombres iguales en proyectos distintos", () => {
  const data = fixture(),
    doc = data.days["2026-10-15"].actual;
  doc.tasks[0].name = "Revisar";
  doc.tasks[2].name = "Revisar";
  registerTasks(data, doc);
  const known = data.tasks.filter((task) => task.name === "Revisar");
  assert.equal(known.length, 2);
  assert.notEqual(known[0].id, known[1].id);
});
test("validación admite datos anteriores y rechaza referencias y proyectos inválidos", () => {
  assert.doesNotThrow(() =>
    validate({
      version: 2,
      tasks: [],
      days: { "2026-10-15": { plan: example(), actual: null } },
    }),
  );
  const data = fixture();
  assert.doesNotThrow(() => validate(data));
  data.days["2026-10-15"].plan.tasks[0].projectId = "missing";
  assert.throws(() => validate(data), /Proyecto/);
  const repeated = fixture();
  repeated.projects.push({ id: "a", name: "Duplicate" });
  assert.throws(() => validate(repeated), /Proyectos/);
});
