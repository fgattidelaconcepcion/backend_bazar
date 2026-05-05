// Endpoints de favoritos - todos requieren autenticación
const express = require('express');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const SELECT_FAVORITES = `
  SELECT f.id AS favorite_id, f.added_at,
         p.id AS product_id, p.name, p.price, p.original_price, p.image_url, p.thumb_url, p.stock,
         c.slug AS category_slug, c.name AS category_name
  FROM favorites f
  JOIN products p ON p.id = f.product_id
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE f.user_id = ?
  ORDER BY f.added_at DESC
`;

function shapeFavorites(rows) {
  return rows.map(r => ({
    favorite_id: r.favorite_id,
    added_at: r.added_at,
    product: {
      id: r.product_id, name: r.name, price: r.price,
      original_price: r.original_price,
      image_url: r.image_url, thumb_url: r.thumb_url, stock: r.stock,
      category: r.category_slug ? { slug: r.category_slug, name: r.category_name } : null
    }
  }));
}

router.get('/', (req, res) => {
  const rows = db.prepare(SELECT_FAVORITES).all(req.user.id);
  res.json({ favorites: shapeFavorites(rows) });
});

// GET /api/favorites/ids - lista de product_ids del usuario (rápido para marcar corazones en el front)
router.get('/ids', (req, res) => {
  const rows = db.prepare('SELECT product_id FROM favorites WHERE user_id = ?').all(req.user.id);
  res.json({ ids: rows.map(r => r.product_id) });
});

router.post('/', (req, res) => {
  const { product_id } = req.body || {};
  if (!product_id) return res.status(400).json({ error: 'product_id es obligatorio' });

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(Number(product_id));
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  try {
    db.prepare('INSERT INTO favorites (user_id, product_id) VALUES (?, ?)')
      .run(req.user.id, product.id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya está en tus favoritos' });
    }
    throw e;
  }

  const rows = db.prepare(SELECT_FAVORITES).all(req.user.id);
  res.status(201).json({ favorites: shapeFavorites(rows) });
});

router.delete('/:product_id', (req, res) => {
  const product_id = Number(req.params.product_id);
  const info = db
    .prepare('DELETE FROM favorites WHERE user_id = ? AND product_id = ?')
    .run(req.user.id, product_id);
  if (info.changes === 0) return res.status(404).json({ error: 'No estaba en favoritos' });
  res.json({ ok: true });
});

module.exports = router;
