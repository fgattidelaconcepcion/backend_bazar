// Entry point del backend Bazar Moderno (single-tenant + backup R2)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",") }));
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Startup async: restore desde R2 ANTES de abrir la DB (que abre cualquier route)
(async () => {
  // 1. Storage adapter (no abre DB)
  const storage = require("./storage");

  // 2. RESTORE: si hay backup en R2, recuperar (overwrite a la DB seedeada por el build)
  const backup = require("./db/backup");
  await backup.restoreFromR2();

  // 2.5. AUTO-REPARACIÓN: Verificar / Crear esquema tras el restore
  // Si el restore trajo un archivo sin tablas o corrupto, init.js se encarga de repararlo.
  try {
    console.log(
      "[backup] Verificando integridad del esquema de la base de datos post-restore...",
    );
    const initDb = require("./db/init");

    // Si tu init.js exporta una función ejecutable, la corremos.
    if (typeof initDb === "function") {
      await initDb();
    }
    console.log("[backup] Verificación de tablas completada con éxito.");
  } catch (dbErr) {
    console.error(
      "[backup] Error crítico al verificar/inicializar el esquema post-restore:",
      dbErr,
    );
  }

  // 3. AHORA podemos cargar las rutas (que abren la DB ya restaurada y verificada)
  const authRoutes = require("./routes/auth");
  const categoryRoutes = require("./routes/categories");
  const productRoutes = require("./routes/products");
  const cartRoutes = require("./routes/cart");
  const favoriteRoutes = require("./routes/favorites");
  const searchRoutes = require("./routes/search");
  const { router: settingsRoutes } = require("./routes/settings");
  const { router: uploadRoutes } = require("./routes/uploads");
  const { authMiddleware, adminMiddleware } = require("./middleware/auth");

  // 4. Servir archivos subidos locales (si no se usa R2)
  if (storage.kind === "local") {
    app.use(
      "/uploads",
      express.static(storage.getUploadsDir(), {
        maxAge: "30d",
        immutable: true,
        fallthrough: false,
      }),
    );
  }

  // 5. Paneles estáticos
  const ADMIN_DIR = path.resolve(__dirname, "..", "admin");
  if (fs.existsSync(ADMIN_DIR)) {
    app.use("/admin", express.static(ADMIN_DIR, { index: "index.html" }));
    console.log("Panel admin servido en /admin desde:", ADMIN_DIR);
  }
  const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
  if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR, { index: "index.html" }));
    console.log("Front público servido en / desde:", PUBLIC_DIR);
  }

  // 6. Health
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "bazar-moderno-api",
      storage: storage.kind,
      time: new Date().toISOString(),
    });
  });

  // 7. Rutas API (single-tenant)
  app.use("/api/auth", authRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/cart", cartRoutes);
  app.use("/api/favorites", favoriteRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/uploads", uploadRoutes);

  // 8. Endpoint manual de backup (admin) — útil para forzar backup desde el panel
  app.post(
    "/api/admin/backup/now",
    authMiddleware,
    adminMiddleware,
    async (_req, res) => {
      const r = await backup.backupNow();
      res.json(r);
    },
  );

  // 9. 404 + error handler
  app.use((req, res) =>
    res
      .status(404)
      .json({ error: `Ruta no encontrada: ${req.method} ${req.url}` }),
  );
  app.use((err, _req, res, _next) => {
    console.error("Error no manejado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  });

  // 10. Start server + activar backup loop
  app.listen(PORT, () => {
    console.log(`🛒 Bazar Moderno API escuchando en http://localhost:${PORT}`);
    backup.startBackupLoop(5 * 60 * 1000);
  });
})().catch((e) => {
  console.error("Fatal en startup:", e);
  process.exit(1);
});
