// Storage adapter: disco local (carpeta /uploads del proyecto)
const path = require('path');
const fs = require('fs');

function create() {
  const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
  const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

  // Asegurar carpetas
  for (const sub of ['images', 'thumbs', 'videos']) {
    fs.mkdirSync(path.join(UPLOADS_DIR, sub), { recursive: true });
  }

  function publicUrl(kind, filename) {
    if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/uploads/${kind}/${filename}`;
    return `/uploads/${kind}/${filename}`;
  }

  return {
    kind: 'local',

    async saveBuffer(buffer, kind, filename) {
      const fullPath = path.join(UPLOADS_DIR, kind, filename);
      await fs.promises.writeFile(fullPath, buffer);
      return { url: publicUrl(kind, filename), filename };
    },

    async saveFromDiskPath(localPath, kind, filename) {
      // El archivo ya está en disco (multer diskStorage).
      // Si es la misma carpeta destino, no hacemos nada.
      const finalPath = path.join(UPLOADS_DIR, kind, filename);
      if (path.resolve(localPath) !== path.resolve(finalPath)) {
        await fs.promises.rename(localPath, finalPath);
      }
      return { url: publicUrl(kind, filename), filename };
    },

    async delete(kind, filename) {
      const fullPath = path.join(UPLOADS_DIR, kind, filename);
      try { await fs.promises.unlink(fullPath); } catch { /* ignore */ }
    },

    getUploadsDir() { return UPLOADS_DIR; }
  };
}

module.exports = { create };