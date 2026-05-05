// Endpoint /api/settings — clave-valor para configuración editable del sitio
const express = require('express');
const db = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Defaults: si una key no está en la DB, usamos esto.
const DEFAULT_SETTINGS = {
  brand_description: 'Tu tienda de confianza para un hogar con estilo.',
  copyright_text: '© 2026 Bazar Moderno. Todos los derechos reservados.',

  contact_email: '',
  contact_phone: '',
  contact_address: '',

  social_instagram: '',
  social_facebook: '',
  social_whatsapp: '',

  page_shipping: 'Realizamos envíos a todo el país. Los pedidos se procesan en 24 a 48 horas hábiles. Recibirás un email con el código de seguimiento cuando salga tu paquete.',
  page_returns: 'Tenés 30 días desde la fecha de compra para devolver el producto en su estado original. Los gastos de envío de devolución corren por cuenta del comprador, salvo que el producto haya llegado defectuoso.',
  page_privacy: 'Respetamos tu privacidad. Tus datos solo se usan para procesar tu compra, mantenerte al tanto del estado del pedido, y enviarte novedades si te suscribiste al newsletter. No los compartimos con terceros.',
  page_faqs: '¿Hacen envíos a todo el país?\nSí, llegamos a todas las provincias.\n\n¿Qué métodos de pago aceptan?\nTarjeta de crédito, débito y transferencia.\n\n¿Cuánto tarda en llegar?\nEntre 3 y 7 días hábiles según la zona.',
  page_about: 'Bazar Moderno nace con la idea de ofrecer productos para el hogar con diseño cuidado y calidad, a precios accesibles. Cada pieza está seleccionada para que renueves tu casa sin gastar de más.',
  page_contact: 'Escribinos por email o WhatsApp y te respondemos en menos de 24 horas. También podés visitarnos en nuestro local.'
};

// Asegurar que la tabla exista (idempotente).
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function readAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = {};
  for (const r of rows) stored[r.key] = r.value;
  return { ...DEFAULT_SETTINGS, ...stored };
}

// GET /api/settings — público
router.get('/', (_req, res) => {
  res.json({ settings: readAllSettings() });
});

// PUT /api/settings — admin. Body: { key1: value1, ... }
router.put('/', authMiddleware, adminMiddleware, (req, res) => {
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body debe ser un objeto { key: value, ... }' });
  }

  const allowedKeys = Object.keys(DEFAULT_SETTINGS);
  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  );

  let updated = 0;
  db.exec('BEGIN');
  try {
    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.includes(key)) continue;
      upsert.run(key, String(value ?? ''));
      updated++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ updated, settings: readAllSettings() });
});

module.exports = { router, DEFAULT_SETTINGS };