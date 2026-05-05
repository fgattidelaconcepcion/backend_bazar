// Storage adapter: Cloudflare R2 (compatible con S3)
//
// Necesita estas vars de entorno:
//   R2_ACCOUNT_ID         - ID de tu cuenta de Cloudflare
//   R2_ACCESS_KEY_ID      - de Cloudflare > R2 > Manage API Tokens
//   R2_SECRET_ACCESS_KEY  - idem
//   R2_BUCKET             - nombre del bucket
//   R2_PUBLIC_URL         - URL pública del bucket (custom domain o pub-XXX.r2.dev)
//                           Sin trailing slash. Ej: https://files.tudominio.com
const fs = require('fs');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

function create() {
  const {
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
    R2_BUCKET, R2_PUBLIC_URL
  } = process.env;

  if (!R2_PUBLIC_URL) {
    console.warn('⚠️  R2_PUBLIC_URL no está seteada. Las URLs públicas no van a funcionar hasta que la configures.');
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });

  function publicUrl(kind, filename) {
    const base = (R2_PUBLIC_URL || '').replace(/\/$/, '');
    return `${base}/${kind}/${filename}`;
  }

  async function upload(body, kind, filename, contentType) {
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: `${kind}/${filename}`,
      Body: body,
      ContentType: contentType,
      // Cache largo: los nombres son hashes random (immutable)
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    return { url: publicUrl(kind, filename), filename };
  }

  return {
    kind: 'r2',

    async saveBuffer(buffer, kind, filename, contentType) {
      return upload(buffer, kind, filename, contentType || 'application/octet-stream');
    },

    async saveFromDiskPath(localPath, kind, filename, contentType) {
      const stream = fs.createReadStream(localPath);
      try {
        const r = await upload(stream, kind, filename, contentType || 'application/octet-stream');
        // Después de subir a R2, borramos el archivo temporal del disco
        try { await fs.promises.unlink(localPath); } catch { /* ignore */ }
        return r;
      } catch (e) {
        try { await fs.promises.unlink(localPath); } catch { /* ignore */ }
        throw e;
      }
    },

    async delete(kind, filename) {
      try {
        await client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: `${kind}/${filename}`
        }));
      } catch (e) {
        console.warn('R2 delete failed:', e.message);
      }
    },

    getUploadsDir() { return null; } // No aplica en R2
  };
}

module.exports = { create };