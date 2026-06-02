// Storage adapter: disco local. 'kind' puede ser un path con subdirectorios.
const path = require("path");
const fs = require("fs");

function create() {
  const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || "./uploads");
  const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(
    /\/$/,
    "",
  );

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  function ensureDir(kindPath) {
    const full = path.join(UPLOADS_DIR, kindPath);
    fs.mkdirSync(full, { recursive: true });
    return full;
  }

  function publicUrl(kind, filename) {
    if (PUBLIC_BASE_URL)
      return `${PUBLIC_BASE_URL}/uploads/${kind}/${filename}`;
    return `/uploads/${kind}/${filename}`;
  }

  return {
    kind: "local",
    async saveBuffer(buffer, kind, filename) {
      const dir = ensureDir(kind);
      await fs.promises.writeFile(path.join(dir, filename), buffer);
      return { url: publicUrl(kind, filename), filename };
    },
    async saveFromDiskPath(localPath, kind, filename) {
      const dir = ensureDir(kind);
      const finalPath = path.join(dir, filename);
      if (path.resolve(localPath) !== path.resolve(finalPath)) {
        await fs.promises.rename(localPath, finalPath);
      }
      return { url: publicUrl(kind, filename), filename };
    },
    async getBuffer(kind, filename) {
      try {
        return await fs.promises.readFile(
          path.join(UPLOADS_DIR, kind, filename),
        );
      } catch {
        return null;
      }
    },
    async delete(kind, filename) {
      try {
        await fs.promises.unlink(path.join(UPLOADS_DIR, kind, filename));
      } catch {}
    },
    getUploadsDir() {
      return UPLOADS_DIR;
    },
  };
}

module.exports = { create };
