// Storage adapter: Cloudflare R2 (compatible con S3).
const fs = require("fs");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

function create() {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PUBLIC_URL,
  } = process.env;

  if (!R2_PUBLIC_URL) {
    console.warn(
      "⚠️  R2_PUBLIC_URL no está seteada. Las URLs públicas no van a funcionar hasta que la configures.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  function publicUrl(kind, filename) {
    const base = (R2_PUBLIC_URL || "").replace(/\/$/, "");
    return `${base}/${kind}/${filename}`;
  }

  async function upload(body, kind, filename, contentType) {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: `${kind}/${filename}`,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { url: publicUrl(kind, filename), filename };
  }

  return {
    kind: "r2",

    async saveBuffer(buffer, kind, filename, contentType) {
      return upload(
        buffer,
        kind,
        filename,
        contentType || "application/octet-stream",
      );
    },

    async saveFromDiskPath(localPath, kind, filename, contentType) {
      const stream = fs.createReadStream(localPath);
      try {
        const r = await upload(
          stream,
          kind,
          filename,
          contentType || "application/octet-stream",
        );
        try {
          await fs.promises.unlink(localPath);
        } catch {}
        return r;
      } catch (e) {
        try {
          await fs.promises.unlink(localPath);
        } catch {}
        throw e;
      }
    },

    async getBuffer(kind, filename) {
      try {
        const result = await client.send(
          new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: `${kind}/${filename}`,
          }),
        );
        // result.Body es un stream legible (Node)
        const chunks = [];
        for await (const chunk of result.Body) chunks.push(chunk);
        return Buffer.concat(chunks);
      } catch (e) {
        if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404)
          return null;
        throw e;
      }
    },

    async delete(kind, filename) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: `${kind}/${filename}`,
          }),
        );
      } catch (e) {
        console.warn("R2 delete failed:", e.message);
      }
    },

    getUploadsDir() {
      return null;
    },
  };
}

module.exports = { create };
