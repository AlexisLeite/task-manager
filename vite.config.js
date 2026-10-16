import { defineConfig } from "vite";
import { openStore } from "./server/database.js";
import { api } from "./server/api.js";
import { attachDatabaseBackups } from "./server/backup-scheduler.js";

export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_STORAGE": JSON.stringify(
      mode === "test" ? "local" : "backend",
    ),
  },
  plugins: [
    {
      name: "worktrack-sqlite",
      configureServer(server) {
        if (mode === "test") return;
        const store = openStore();
        server.middlewares.use(api(store));
        server.httpServer?.once("close", () => store.close());
        attachDatabaseBackups(server.httpServer);
      },
    },
  ],
}));
