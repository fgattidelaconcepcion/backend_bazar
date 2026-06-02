// Backup automático del SQLite a R2.
// - backupNow(): copia consistente (VACUUM INTO) -> encripta AES-256-GCM -> sube a R2
// - restoreFromR2(): si hay backup en R2, lo descarga, desencripta y reemplaza la DB local
// - startBackupLoop(ms): timer cada N ms
//
// La política de restore es: SIEMPRE restaurar si hay backup en R2, no importa
// si la DB local existe. Esto es porque el build de Render puede haber corrido
// `npm run seed` y dejado una DB con datos de ejemplo — queremos reemplazarla
// con los datos reales del último backup.
//
// Solo activo cuando storage backend es R2.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const storage = require("../storage");

const DB_PATH = path.resolve(process.env.DB_PATH || "./src/db/bazar.db");
const TEMP_BACKUP = "/tmp/bazar-backup-snapshot.db";
const BACKUP_KIND = "db-backups";
const BACKUP_FILENAME = "bazar.db.enc";

function getEncryptionKey() {
  const secret =
    process.env.BACKUP_KEY || process.env.JWT_SECRET || "dev-secret-change-me";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function encrypt(buf) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato: [12 bytes iv][16 bytes tag][ciphertext]
  return Buffer.concat([iv, tag, ct]);
}

function decrypt(buf) {
  const key = getEncryptionKey();
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

async function backupNow() {
  if (storage.kind !== "r2") {
    return { skipped: true, reason: "storage no es r2" };
  }
  try {
    try {
      fs.unlinkSync(TEMP_BACKUP);
    } catch {}
    // VACUUM INTO: copia consistente del DB sin bloquear writes
    const db = require("./database");
    db.exec(`VACUUM INTO '${TEMP_BACKUP.replace(/'/g, "''")}'`);

    const raw = await fs.promises.readFile(TEMP_BACKUP);
    const enc = encrypt(raw);
    await storage.saveBuffer(
      enc,
      BACKUP_KIND,
      BACKUP_FILENAME,
      "application/octet-stream",
    );

    try {
      fs.unlinkSync(TEMP_BACKUP);
    } catch {}

    const ts = new Date().toISOString();
    console.log(
      `[backup ${ts}] OK · raw ${(raw.length / 1024).toFixed(1)} KB · enc ${(enc.length / 1024).toFixed(1)} KB`,
    );
    return { ok: true, size_raw: raw.length, size_enc: enc.length };
  } catch (e) {
    console.error("[backup] ERROR:", e.message);
    return { ok: false, error: e.message };
  }
}

// Siempre intenta restaurar desde R2 si hay backup.
// - Si R2 tiene backup: descarga, desencripta y reemplaza la DB local
// - Si no hay backup: deja la DB local como está (puede estar vacía o seedeada)
async function restoreFromR2() {
  if (storage.kind !== "r2") {
    console.log("[backup] Storage no es R2, skip restore.");
    return false;
  }

  console.log("[backup] Buscando backup en R2...");
  try {
    const enc = await storage.getBuffer(BACKUP_KIND, BACKUP_FILENAME);
    if (!enc || enc.length === 0) {
      console.log(
        "[backup] No hay backup previo en R2, se mantiene la DB local (si existe).",
      );
      return false;
    }
    const raw = decrypt(enc);
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    await fs.promises.writeFile(DB_PATH, raw);
    console.log(
      `[backup] RESTORE OK · ${(raw.length / 1024).toFixed(1)} KB recuperados desde R2`,
    );
    return true;
  } catch (e) {
    if (
      String(e.message).includes("NoSuchKey") ||
      String(e.message).includes("404")
    ) {
      console.log("[backup] No hay backup previo en R2.");
      return false;
    }
    console.error("[backup] RESTORE ERROR:", e.message);
    console.error(
      "         ¿Cambiaste el JWT_SECRET/BACKUP_KEY? Los backups viejos quedan ilegibles.",
    );
    return false;
  }
}

let backupTimer = null;
function startBackupLoop(intervalMs = 5 * 60 * 1000) {
  if (backupTimer) clearInterval(backupTimer);
  // Primer backup a los 30s (dejar que el server termine de arrancar)
  setTimeout(() => backupNow(), 30 * 1000);
  backupTimer = setInterval(() => backupNow(), intervalMs);
  console.log(`[backup] Loop activado cada ${Math.round(intervalMs / 1000)}s`);
}

// Mantengo el nombre viejo como alias por compatibilidad
const restoreFromR2IfMissing = restoreFromR2;

module.exports = {
  backupNow,
  restoreFromR2,
  restoreFromR2IfMissing,
  startBackupLoop,
};
