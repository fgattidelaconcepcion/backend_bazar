// Endpoints de uploads: imagenes (con optimizacion sharp -> WebP + thumb) y videos.
//
// Las imagenes se procesan en streaming a memoria (multer.memoryStorage) y se
// pasan directamente al storage adapter. Los videos no se procesan: multer los
// escribe a una carpeta temporal en disco y despues el adapter los mueve al
// destino final (disco local o sube a R2).
//
// IMPORTANTE: este archivo NO sabe si esta usando disco local o R2. Toda la
// logica de "donde guardar" vive en src/storage/{index,local,r2}.js. Aca solo
// usamos saveBuffer / saveFromDiskPath / delete y el adapter resuelve.
const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const db = require("../db/database");
const storage = require("../storage");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

const router = express.Router();

// --- Config ---
const MAX_IMAGE_MB = parseInt(process.env.MAX_IMAGE_MB, 10) || 10;
const MAX_VIDEO_MB = parseInt(process.env.MAX_VIDEO_MB, 10) || 100;
const IMAGE_MAX_WIDTH = parseInt(process.env.IMAGE_MAX_WIDTH, 10) || 1600;
const IMAGE_QUALITY = parseInt(process.env.IMAGE_QUALITY, 10) || 80;
const THUMB_WIDTH = parseInt(process.env.THUMB_WIDTH, 10) || 400;

const IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];
const VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
];

// Carpeta temporal donde multer escribe los videos antes de pasarlos al
// adapter. En R2 el adapter sube el archivo y lo borra de aca. En local el
// adapter mueve (rename) el archivo a uploads/videos/.
const TMP_UPLOAD_DIR = path.join(os.tmpdir(), "bazar-uploads");
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

// --- Multer ---
function rndName(ext = "") {
  return crypto.randomBytes(12).toString("hex") + ext;
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de imagen no permitido"));
  },
});

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TMP_UPLOAD_DIR),
    filename: (_req, file, cb) =>
      cb(null, rndName(path.extname(file.originalname).toLowerCase())),
  }),
  limits: { fileSize: MAX_VIDEO_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (VIDEO_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de video no permitido"));
  },
});

// --- Errores de multer en formato JSON ---
function multerErrorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Archivo demasiado grande" });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: "Error interno" });
}

// POST /api/uploads/image  (admin)
// FormData: file = <imagen>
router.post("/image", authMiddleware, adminMiddleware, (req, res, next) => {
  imageUpload.single("file")(req, res, async (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file)
      return res
        .status(400)
        .json({ error: 'No se recibio ningun archivo (campo "file")' });

    try {
      const baseName = rndName("");
      const fullName = `${baseName}.webp`;
      const thumbName = `${baseName}_thumb.webp`;

      // Imagen optimizada: limita al ancho maximo y convierte a WebP.
      const main = sharp(req.file.buffer, { failOn: "truncated" })
        .rotate()
        .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: IMAGE_QUALITY });

      const { data: mainData, info: mainInfo } = await main.toBuffer({
        resolveWithObject: true,
      });

      // Thumbnail
      const thumbData = await sharp(req.file.buffer)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();

      // Guardar en el storage (local o R2 segun .env)
      const mainSaved = await storage.saveBuffer(
        mainData,
        "images",
        fullName,
        "image/webp",
      );
      const thumbSaved = await storage.saveBuffer(
        thumbData,
        "thumbs",
        thumbName,
        "image/webp",
      );

      const url = mainSaved.url;
      const thumb_url = thumbSaved.url;

      db.prepare(
        `INSERT INTO uploads (user_id, kind, filename, url, thumb_url, mime, size_bytes, width, height)
         VALUES (?, 'image', ?, ?, ?, 'image/webp', ?, ?, ?)`,
      ).run(
        req.user.id,
        fullName,
        url,
        thumb_url,
        mainData.length,
        mainInfo.width,
        mainInfo.height,
      );

      res.status(201).json({
        url,
        thumb_url,
        kind: "image",
        size_bytes: mainData.length,
        original_size_bytes: req.file.size,
        width: mainInfo.width,
        height: mainInfo.height,
        mime: "image/webp",
      });
    } catch (e) {
      console.error("Image processing error:", e);
      res.status(400).json({ error: "No se pudo procesar la imagen" });
    }
  });
});

// POST /api/uploads/video  (admin)
// FormData: file = <video>
router.post("/video", authMiddleware, adminMiddleware, (req, res, next) => {
  videoUpload.single("file")(req, res, async (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file)
      return res
        .status(400)
        .json({ error: 'No se recibio ningun archivo (campo "file")' });

    try {
      // El video ya esta en disco temporal. El adapter lo mueve a su lugar
      // definitivo (disco local) o lo sube a R2 y borra el temporal.
      const saved = await storage.saveFromDiskPath(
        req.file.path,
        "videos",
        req.file.filename,
        req.file.mimetype,
      );

      db.prepare(
        `INSERT INTO uploads (user_id, kind, filename, url, mime, size_bytes)
         VALUES (?, 'video', ?, ?, ?, ?)`,
      ).run(
        req.user.id,
        req.file.filename,
        saved.url,
        req.file.mimetype,
        req.file.size,
      );

      res.status(201).json({
        url: saved.url,
        kind: "video",
        size_bytes: req.file.size,
        mime: req.file.mimetype,
        filename: req.file.filename,
      });
    } catch (e) {
      console.error("Video upload error:", e);
      try {
        await fs.promises.unlink(req.file.path);
      } catch {}
      res.status(500).json({ error: "No se pudo guardar el video" });
    }
  });
});

// GET /api/uploads  (admin) - listar ultimos uploads
router.get("/", authMiddleware, adminMiddleware, (_req, res) => {
  const rows = db
    .prepare(
      "SELECT id, kind, url, thumb_url, mime, size_bytes, width, height, created_at FROM uploads ORDER BY created_at DESC LIMIT 100",
    )
    .all();
  res.json({ uploads: rows });
});

// DELETE /api/uploads/:id  (admin)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Upload no encontrado" });

  // Borrar del storage (local o R2). Es best-effort: si falla, igual sacamos
  // el registro de la DB para no dejar referencias colgando.
  if (row.kind === "image") {
    await storage.delete("images", row.filename);
    if (row.thumb_url) {
      try {
        const thumbName = path.basename(
          new URL(row.thumb_url, "http://x").pathname,
        );
        await storage.delete("thumbs", thumbName);
      } catch {}
    }
  } else {
    await storage.delete("videos", row.filename);
  }

  db.prepare("DELETE FROM uploads WHERE id = ?").run(id);
  res.json({ ok: true });
});

module.exports = { router };
