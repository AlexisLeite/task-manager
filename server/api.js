import { validate } from "../src/model.js";
import { sessionLifetime } from "./auth.js";

export function api(store) {
  const attempts = new Map();
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
      if (!["GET", "HEAD"].includes(req.method) && req.headers.origin &&
          ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin))
        return send(403, { error: "Origen no permitido" });
      const token = (req.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith("worktrack_session="))?.slice(18);
      const cookie = (value, age) => `worktrack_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${req.socket.encrypted ? "; Secure" : ""}`;
      const user = store.session(token);
      if (path === "/api/session" && req.method === "GET")
        return send(user ? 200 : 401, user ? { user } : { error: "Iniciá sesión para continuar." });
      if (path === "/api/login" && req.method === "POST") {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        for (const [address, entry] of attempts) if (entry.until <= now) attempts.delete(address);
        const attempt = attempts.get(key) || { count: 0, until: now + 60_000 };
        if (attempt.count >= 10) return send(429, { error: "Demasiados intentos. Esperá un minuto e intentá de nuevo." }, { "Retry-After": "60" });
        if (!req.headers["content-type"]?.startsWith("application/json")) return send(415, { error: "Se requiere JSON" });
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString("utf8");
          if (Buffer.byteLength(body) > 4096) return send(413, { error: "Solicitud demasiado grande" });
        }
        let credentials;
        try { credentials = JSON.parse(body); } catch { return send(400, { error: "Formato inválido" }); }
        if (typeof credentials?.username !== "string" || typeof credentials?.password !== "string")
          return send(400, { error: "Ingresá usuario y contraseña." });
        attempt.count++;
        attempts.set(key, attempt);
        const session = await store.login(credentials.username, credentials.password);
        if (!session) return send(401, { error: "Usuario o contraseña incorrectos." });
        attempts.delete(key);
        store.logout(token);
        return send(200, { user: session.user }, { "Set-Cookie": cookie(session.token, sessionLifetime / 1000) });
      }
      if (path === "/api/logout" && req.method === "POST") {
        store.logout(token);
        return send(200, { ok: true }, { "Set-Cookie": cookie("", 0) });
      }
      if (!user) return send(401, { error: "Iniciá sesión para continuar." });
      if (path !== "/api/workspace")
        return send(404, { error: "Ruta no encontrada" });
      if (req.method === "GET") {
        const { data, revision } = store.read(user.id);
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
        false,
        user.id,
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
