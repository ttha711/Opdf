import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiRouter from "./server/routes/index";
import { generalLimiter } from "./server/middleware/rateLimiter";
import { errorHandler, notFoundHandler } from "./server/middleware/errorHandler";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Middleware for large payloads
  app.use(express.json({ limit: "50mb" }));
  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  // Global rate limit
  app.use("/api", generalLimiter);

  // Register all modular api sub-routes
  app.use("/api", apiRouter);

  // Error handling
  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
