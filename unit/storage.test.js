import { test } from "node:test";
import assert from "node:assert/strict";
import { Repository } from "../src/storage.js";
import { syncPlan, document, task, block, union } from "../src/model.js";

test("un adaptador asíncrono intercambiable serializa escrituras e inmoviliza cada snapshot", async () => {
  const written = [],
    release = [];
  const repository = new Repository({
    load: async () => ({ version: 2 }),
    save: async (value) => {
      written.push(value);
      await new Promise((resolve) => release.push(resolve));
    },
  });
  assert.deepEqual(await repository.load(), { version: 2 });
  const data = { value: 1 };
  const first = repository.save(data);
  data.value = 2;
  const second = repository.save(data);
  data.value = 3;
  await new Promise(setImmediate);
  assert.deepEqual(written, [{ value: 1 }]);
  release.shift()();
  await first;
  await new Promise(setImmediate);
  assert.deepEqual(written, [{ value: 1 }, { value: 2 }]);
  release.shift()();
  await second;
});
test("un error de escritura se propaga y no bloquea el guardado posterior", async () => {
  let value;
  const repository = new Repository({
    save: async (data) => {
      if (data.fail) throw Error("offline");
      value = data;
    },
  });
  await assert.rejects(repository.save({ fail: true }), /offline/);
  await repository.save({ value: 2 });
  assert.deepEqual(value, { value: 2 });
});
test("sincronizar no pierde tareas ni horarios existentes y no duplica bloques en sucesivas pasadas", () => {
  const doc = document();
  doc.tasks = [task([]), task([{ code: "t1" }])];
  doc.blocks = [
    { ...block(), taskIds: [doc.tasks[0].id], start: "09:00", end: "10:00" },
  ];
  syncPlan(doc);
  syncPlan(doc);
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks[0].start, "09:00");
  assert.deepEqual(
    new Set(doc.blocks.flatMap((b) => b.taskIds)),
    new Set(doc.tasks.map((t) => t.id)),
  );
  assert.equal(
    union([
      { start: "09:00", end: "12:00" },
      { start: "10:00", end: "11:00" },
      { start: "11:30", end: "13:00" },
      { start: "14:00", end: "15:00" },
    ]),
    300,
  );
});
