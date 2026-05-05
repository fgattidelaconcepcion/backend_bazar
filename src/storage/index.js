// Storage adapter: elige automáticamente local o R2 según .env
//
// Si están definidas TODAS las variables R2_*, usa Cloudflare R2.
// Si no, usa disco local.
//
// El adapter expone una interfaz común:
//   saveBuffer(buffer, kind, filename, contentType) -> { url, filename }
//   saveFromDiskPath(localPath, kind, filename, contentType) -> { url, filename }
//   delete(kind, filename) -> void
//   getUploadsDir() -> string  (solo válido para local; null en R2)
//
// 'kind' es 'images' | 'thumbs' | 'videos'.

const local = require('./local');
const r2 = require('./r2');

const useR2 = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET
);

const adapter = useR2 ? r2.create() : local.create();

console.log(`Storage backend: ${useR2 ? 'Cloudflare R2 (' + process.env.R2_BUCKET + ')' : 'disco local'}`);

module.exports = adapter;
module.exports.useR2 = useR2;