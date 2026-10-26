import test from "node:test";
import assert from "node:assert/strict";
import { task, validate } from "../src/model.js";
import { canonicalWorkspace, refreshContinuations } from "../src/overnight.js";

const workspace = () => ({
  version: 2,
  tasks: [],
  days: {},
  projects: [{ id: "p", name: "Proyecto" }],
});
test("backlog es opcional y se conserva al guardar y reconstruir continuaciones", () => {
  const data = workspace();
  assert.doesNotThrow(() => validate(data));
  data.backlog = [
    { ...task([]), name: "Pendiente", projectId: "p", estimate: "01:30" },
  ];
  assert.doesNotThrow(() => validate(data));
  const canonical = canonicalWorkspace(data);
  refreshContinuations(canonical);
  assert.deepEqual(canonical.backlog, data.backlog);
});
test("rechaza identidades duplicadas, proyectos ausentes, duraciones inválidas", () => {
  const entry = { ...task([]), name: "Pendiente" };
  for (const backlog of [
    [entry, entry],
    [{ ...entry, estimate: "ayer" }],
    [{ ...entry, projectId: "missing" }],
    [null],
  ]) {
    assert.throws(() => validate({ ...workspace(), backlog }), /Backlog/);
  }
});
