import "./env";
import fs from "fs";
import path from "path";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { config, configWarnings } from "./config";
import { apiRouter } from "./routes/api";

async function start() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const w of configWarnings()) console.warn(`[config] ${w}`);

  const app = express();
  app.disable("x-powered-by");
  // Behind nginx on the same machine: take the client IP from X-Forwarded-For
  app.set("trust proxy", "loopback");

  app.use(
    "/api",
    clerkMiddleware({
      secretKey: config.clerk.secretKey || undefined,
      publishableKey: config.clerk.publishableKey || undefined,
    }),
    apiRouter(),
  );

  if (config.isProduction) {
    const dist = path.resolve("dist");
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        },
      }),
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    // Dev: Vite as middleware, one port for frontend and API
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(config.port, config.host, () => {
    console.log(`FashionFinder server on http://${config.host}:${config.port} (${config.isProduction ? "production" : "dev"})`);
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
