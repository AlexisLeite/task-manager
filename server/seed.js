import { readFileSync } from "node:fs";
import { openStore, defaultDatabase } from "./database.js";
import { validate } from "../src/model.js";

const file = process.argv[2];
if (!file) throw Error("Uso: npm run seed -- ruta-al-json");
const data = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
validate(data);
const store = openStore();
try {
  store.seed(data);
  console.log(
    `Seed importado: ${Object.keys(data.days).length} jornadas. SQLite: ${defaultDatabase()}`,
  );
} finally {
  store.close();
}
