import { validate } from "../src/model.js";

export function api(store) {
  return async (
    req,
    res,
    next = () => {
      res.writeHead(404);
      res.end();
    },
  ) => {
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/")) return next();
    const send = (status, body, headers = {}) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...headers,
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (path === "/api/health" && req.method === "GET")
        return send(200, { ok: true });
      if (path !== "/api/workspace")
        return send(404, { error: "Ruta no encontrada" });
      if (req.method === "GET") {
        const { data, revision } = store.read();
        if (req.headers["if-none-match"] === `"${revision}"`) {
          res.writeHead(304, {
            ETag: `"${revision}"`,
            "Cache-Control": "no-store",
          });
          return res.end();
        }
        return send(200, data, { ETag: `"${revision}"` });
      }
      if (req.method !== "PUT")
        return send(
          405,
          { error: "Método no permitido" },
          { Allow: "GET, PUT" },
        );
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`
      )
        return send(403, { error: "Origen no permitido" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(415, { error: "Se requiere JSON" });
      if (!/^"\d+"$/.test(req.headers["if-match"] || ""))
        return send(428, { error: "Se requiere la revisión de los datos" });
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 10 * 1024 * 1024)
          return send(413, { error: "El documento supera los 10 MB" });
        chunks.push(chunk);
      }
      let data;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        validate(data);
      } catch {
        return send(400, { error: "Formato de datos inválido" });
      }
      const revision = store.write(
        data,
        Number(req.headers["if-match"].slice(1, -1)),
      );
      return send(200, { revision }, { ETag: `"${revision}"` });
    } catch (error) {
      if (error.status === 409) return send(409, { error: error.message });
      console.error("Workspace API:", error.message);
      return send(500, {
        error: "No se pudieron guardar o leer los datos. Intentá nuevamente.",
      });
    }
  };
}
