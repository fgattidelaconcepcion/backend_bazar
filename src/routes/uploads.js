// Endpoints de uploads: imágenes (con optimización sharp -> WebP + thumb) y videos.
// Las imágenes se procesan en streaming a memoria, no tocan disco hasta estar
// optimizadas. Los videos se guardan tal cual con límite estricto de tamaño
// (transcodificar en el server lo satura — para eso conviene Cloudinary/Mux).
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// --- Config ---
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const MAX_IMAGE_MB = parseInt(process.env.MAX_IMAGE_MB, 10) || 10;
const MAX_VIDEO_MB = parseInt(process.env.MAX_VIDEO_MB, 10) || 100;
const IMAGE_MAX_WIDTH = parseInt(process.env.IMAGE_MAX_WIDTH, 10) || 1600;
const IMAGE_QUALITY = parseInt(process.env.IMAGE_QUALITY, 10) || 80;
const THUMB_WIDTH = parseInt(process.env.THUMB_WIDTH, 10) || 400;

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];

// Asegurar carpetas
for (const sub of ['images', 'videos', 'thumbs']) {
  fs.mkdirSync(path.join(UPLOADS_DIR, sub), { recursive: true });
}

// --- Multer ---
// Para imágenes usamos memoryStorage (las procesamos con sharp y escribimos
// sólo el resultado optimizado). Para videos usamos diskStorage para no
// cargarlos en RAM.
function rndName(ext = '') {
  return crypto.randomBytes(12).toString('hex') + ext;
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de imagen no permitido'));
  }
});

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOADS_DIR, 'videos')),
    filename: (_req, file, cb) => cb(null, rndName(path.extname(file.originalname).toLowerCase()))
  }),
  limits: { fileSize: MAX_VIDEO_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (VIDEO_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de video no permitido'));
  }
});

function publicUrl(relPath) {
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/uploads/${relPath}`;
  return `/uploads/${relPath}`;
}

// --- Errores de multer en formato JSON ---
function multerErrorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Archivo demasiado grande' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: 'Error interno' });
}

// POST /api/uploads/image  (admin)
// FormData: file = <imagen>
router.post('/image', authMiddleware, adminMiddleware, (req, res, next) => {
  imageUpload.single('file')(req, res, async (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo (campo "file")' });

    try {
      const baseName = rndName('');
      const fullName = `${baseName}.webp`;
      const thumbName = `${baseName}_thumb.webp`;

      // Imagen optimizada: limita al ancho máximo y convierte a WebP.
      const main = sharp(req.file.buffer, { failOn: 'truncated' })
        .rotate() // respeta orientación EXIF
        .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: IMAGE_QUALITY });

      const { data: mainData, info: mainInfo } = await main.toBuffer({ resolveWithObject: true });
      await fs.promises.writeFile(path.join(UPLOADS_DIR, 'images', fullName), mainData);

      // Thumbnail
      const thumbData = await sharp(req.file.buffer)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
      await fs.promises.writeFile(path.join(UPLOADS_DIR, 'thumbs', thumbName), thumbData);

      const url = publicUrl(`images/${fullName}`);
      const thumb_url = publicUrl(`thumbs/${thumbName}`);

      db.prepare(
        `INSERT INTO uploads (user_id, kind, filename, url, thumb_url, mime, size_bytes, width, height)
         VALUES (?, 'image', ?, ?, ?, 'image/webp', ?, ?, ?)`
      ).run(req.user.id, fullName, url, thumb_url, mainData.length, mainInfo.width, mainInfo.height);

      res.status(201).json({
        url, thumb_url,
        kind: 'image',
        size_bytes: mainData.length,
        original_size_bytes: req.file.size,
        width: mainInfo.width,
        height: mainInfo.height,
        mime: 'image/webp'
      });
    } catch (e) {
      console.error('Image processing error:', e);
      res.status(400).json({ error: 'No se pudo procesar la imagen' });
    }
  });
});

// POST /api/uploads/video  (admin)
// FormData: file = <video>
router.post('/video', authMiddleware, adminMiddleware, (req, res, next) => {
  videoUpload.single('file')(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo (campo "file")' });

    const url = publicUrl(`videos/${req.file.filename}`);

    db.prepare(
      `INSERT INTO uploads (user_id, kind, filename, url, mime, size_bytes)
       VALUES (?, 'video', ?, ?, ?, ?)`
    ).run(req.user.id, req.file.filename, url, req.file.mimetype, req.file.size);

    res.status(201).json({
      url,
      kind: 'video',
      size_bytes: req.file.size,
      mime: req.file.mimetype,
      filename: req.file.filename
    });
  });
});

// GET /api/uploads  (admin) - listar últimos uploads
router.get('/', authMiddleware, adminMiddleware, (_req, res) => {
  const rows = db.prepare(
    'SELECT id, kind, url, thumb_url, mime, size_bytes, width, height, created_at FROM uploads ORDER BY created_at DESC LIMIT 100'
  ).all();
  res.json({ uploads: rows });
});

// DELETE /api/uploads/:id  (admin)
router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Upload no encontrado' });

  // Borrar archivos físicos (best-effort)
  const tryUnlink = (p) => { try { fs.unlinkSync(p); } catch {} };
  if (row.kind === 'image') {
    tryUnlink(path.join(UPLOADS_DIR, 'images', row.filename));
    if (row.thumb_url) {
      const thumbName = path.basename(new URL(row.thumb_url, 'http://x').pathname);
      tryUnlink(path.join(UPLOADS_DIR, 'thumbs', thumbName));
    }
  } else {
    tryUnlink(path.join(UPLOADS_DIR, 'videos', row.filename));
  }

  db.prepare('DELETE FROM uploads WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = { router, UPLOADS_DIR };
