// Entry point del backend Bazar Moderno
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const categoryRoutes = require("./routes/categories");
const productRoutes = require("./routes/products");
const cartRoutes = require("./routes/cart");
const favoriteRoutes = require("./routes/favorites");
const searchRoutes = require("./routes/search");
const { router: settingsRoutes } = require("./routes/settings");
const { router: uploadRoutes } = require("./routes/uploads");
const storage = require("./storage");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",") }));
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Servir uploads locales (solo cuando el adapter es local)
if (storage.kind === "local") {
  // Servir uploads locales
  app.use(
    "/uploads",
    express.static("/tmp/uploads", {
      maxAge: "30d",
      immutable: true,
      fallthrough: false,
    }),
  );
}
// Servir el panel admin desde /admin (si existe la carpeta admin/)
const fs = require("fs");
const ADMIN_DIR = path.resolve(__dirname, "..", "admin");
if (fs.existsSync(ADMIN_DIR)) {
  app.use("/admin", express.static(ADMIN_DIR, { index: "index.html" }));
  console.log("Panel admin servido en /admin desde:", ADMIN_DIR);
}

// Servir el front público desde /public si existe
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { index: "index.html" }));
  console.log("Front público servido en / desde:", PUBLIC_DIR);
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "bazar-moderno-api",
    storage: storage.kind,
    time: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/uploads", uploadRoutes);

app.use((req, res) => {
  res
    .status(404)
    .json({ error: `Ruta no encontrada: ${req.method} ${req.url}` });
});

app.use((err, _req, res, _next) => {
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

app.listen(PORT, () => {
  console.log(`🛒 Bazar Moderno API escuchando en http://localhost:${PORT}`);
});
