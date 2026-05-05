// Conexión a SQLite usando el módulo nativo de Node 22+ (node:sqlite)
// No requiere compilación nativa.
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config();

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, 'bazar.db');

const db = new DatabaseSync(dbPath);
// Si el FS soporta WAL, mejor; si no, MEMORY como fallback.
try { db.exec('PRAGMA journal_mode = WAL;'); }
catch { db.exec('PRAGMA journal_mode = MEMORY;'); }
db.exec('PRAGMA foreign_keys = ON;');

module.exports = db;
