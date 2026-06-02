// Entry point del backend Bazar Moderno (multi-tenant + backup R2)
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

// Startup async para poder restaurar DB desde R2 ANTES de abrir la conexión
(async () => {
  // 1. Storage adapter (sin abrir DB)
  const storage = require("./storage");

  // 2. RESTORE: si la DB local no existe (post-deploy en Render), bajarla de R2
  const backup = require("./db/backup");
  await backup.restoreFromR2IfMissing();

  // 3. AHORA podemos abrir la DB y correr migraciones
  require("./db/migrations").run();

  // 4. Servir archivos subidos (solo cuando storage es local)
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
  const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
  const ADMIN_DIR = path.resolve(__dirname, "..", "admin");
  const SUPER_DIR = path.resolve(__dirname, "..", "super-admin");

  if (fs.existsSync(SUPER_DIR)) {
    app.use("/super-admin", express.static(SUPER_DIR, { index: "index.html" }));
    console.log("Super-admin servido en /super-admin");
  }
  if (fs.existsSync(ADMIN_DIR)) {
    app.get("/t/:slug/admin", (_req, res) =>
      res.sendFile(path.join(ADMIN_DIR, "index.html")),
    );
    app.use("/admin", express.static(ADMIN_DIR, { index: "index.html" }));
    console.log("Admin servido en /t/:slug/admin y /admin (legacy)");
  }
  if (fs.existsSync(PUBLIC_DIR)) {
    app.get("/t/:slug", (_req, res) =>
      res.sendFile(path.join(PUBLIC_DIR, "index.html")),
    );
    app.get("/", (_req, res) => {
      if (fs.existsSync(SUPER_DIR)) return res.redirect("/super-admin");
      res.send("<h1>Bazar Moderno</h1><p>Accedé a una tienda en /t/:slug</p>");
    });
  }

  // 6. Health
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "bazar-moderno-api",
      storage: storage.kind,
      multi_tenant: true,
      time: new Date().toISOString(),
    });
  });

  // 7. Rutas
  const authRoutes = require("./routes/auth");
  const {
    publicRouter: catPublic,
    adminRouter: catAdmin,
  } = require("./routes/categories");
  const {
    publicRouter: prodPublic,
    adminRouter: prodAdmin,
  } = require("./routes/products");
  const {
    publicRouter: settingsPublic,
    adminRouter: settingsAdmin,
  } = require("./routes/settings");
  const searchRoutes = require("./routes/search");
  const { router: uploadAdmin } = require("./routes/uploads");
  const superAdminRoutes = require("./routes/superAdmin");
  const {
    tenantBySlug,
    authMiddleware,
    superAdminMiddleware,
  } = require("./middleware/auth");

  app.use("/api/auth", authRoutes);
  app.use("/api/t/:slug/categories", tenantBySlug, catPublic);
  app.use("/api/t/:slug/products", tenantBySlug, prodPublic);
  app.use("/api/t/:slug/search", tenantBySlug, searchRoutes);
  app.use("/api/t/:slug/settings", tenantBySlug, settingsPublic);
  app.use("/api/admin/categories", catAdmin);
  app.use("/api/admin/products", prodAdmin);
  app.use("/api/admin/settings", settingsAdmin);
  app.use("/api/admin/uploads", uploadAdmin);
  app.use("/api/super-admin", superAdminRoutes);

  // 8. Endpoint manual de backup (solo super-admin) — útil para probar
  app.post(
    "/api/super-admin/backup/now",
    authMiddleware,
    superAdminMiddleware,
    async (_req, res) => {
      const r = await backup.backupNow();
      res.json(r);
    },
  );

  // 9. 404 y error handler
  app.use((req, res) =>
    res
      .status(404)
      .json({ error: `Ruta no encontrada: ${req.method} ${req.url}` }),
  );
  app.use((err, _req, res, _next) => {
    console.error("Error no manejado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  });

  // 10. Start server + backup loop
  app.listen(PORT, () => {
    console.log(
      `🛒 Bazar Moderno API (multi-tenant) en http://localhost:${PORT}`,
    );
    console.log(`   Storefront público:  /t/:slug`);
    console.log(`   Panel admin tenant:  /t/:slug/admin`);
    console.log(`   Panel super-admin:   /super-admin`);
    // Arrancar backup loop (cada 5 min)
    backup.startBackupLoop(5 * 60 * 1000);
  });
})().catch((e) => {
  console.error("Fatal en startup:", e);
  process.exit(1);
});
