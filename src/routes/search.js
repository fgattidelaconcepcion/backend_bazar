// Endpoint /api/search?q=X
// Devuelve sugerencias para el autocomplete: top productos + top categorías
// que matchean. Búsqueda case + accent insensitive.
const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Quita acentos: "café" -> "cafe", "ÑOÑO" -> "nono".
function deburr(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

router.get('/', (req, res) => {
  const qRaw = String(req.query.q || '').trim();
  if (qRaw.length < 1) return res.json({ products: [], categories: [], q: qRaw });

  const limitProducts = Math.min(parseInt(req.query.limit_products, 10) || 8, 20);
  const limitCategories = Math.min(parseInt(req.query.limit_categories, 10) || 5, 20);

  const like = `%${qRaw.replace(/[\\%_]/g, c => '\\' + c)}%`;
  const qNorm = deburr(qRaw);

  // Pre-filtro por LIKE (rápido), luego refinamos en JS por la versión sin acentos.
  db.prepare(`
    SELECT p.id, p.name, p.description, p.price, p.original_price,
           p.image_url, p.thumb_url, p.is_new,
           c.id AS category_id, c.slug AS category_slug, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\'
    LIMIT 100
  `).all(like, like);

  const allProducts = db.prepare(`
    SELECT p.id, p.name, p.description, p.price, p.original_price,
           p.image_url, p.thumb_url, p.is_new,
           c.id AS category_id, c.slug AS category_slug, c.name AS category_name
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
  `).all();

  const matchedProducts = allProducts
    .filter(p => deburr(p.name).includes(qNorm) || (p.description && deburr(p.description).includes(qNorm)))
    .slice(0, limitProducts)
    .map(p => ({
      id: p.id, name: p.name, price: p.price, original_price: p.original_price,
      on_sale: !!(p.original_price && p.price < p.original_price),
      image_url: p.image_url, thumb_url: p.thumb_url, is_new: !!p.is_new,
      category: p.category_id ? { id: p.category_id, slug: p.category_slug, name: p.category_name } : null
    }));

  const allCats = db.prepare('SELECT id, slug, name, image_url FROM categories').all();
  const matchedCats = allCats
    .filter(c => deburr(c.name).includes(qNorm) || deburr(c.slug).includes(qNorm))
    .slice(0, limitCategories);

  res.json({ q: qRaw, products: matchedProducts, categories: matchedCats });
});

module.exports = router;