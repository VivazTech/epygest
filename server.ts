import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import { createApp } from "./src/app.ts";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  // Rotas /api sem handler → JSON (evita HTML do Vite quando o servidor não recarregou)
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Rota da API não encontrada. Reinicie o servidor (npm run dev)." });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: false,
      root: projectRoot,
      plugins: [react()],
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.get("/", async (_req, res, next) => {
      try {
        const template = await readFile("index.html", "utf-8");
        const html = await vite.transformIndexHtml("/", template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (error) {
        next(error);
      }
    });
  } else {
    const express = (await import("express")).default;
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
