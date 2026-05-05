// Endpoints de carrito - todos requieren autenticación
const express = require('express');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const SELECT_CART = `
  SELECT ci.id AS cart_item_id, ci.quantity, ci.added_at,
         p.id AS product_id, p.name, p.price, p.original_price, p.image_url, p.thumb_url, p.stock,
         c.slug AS category_slug, c.name AS category_name
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE ci.user_id = ?
  ORDER BY ci.added_at DESC
`;

function shapeCart(rows) {
  const items = rows.map(r => ({
    cart_item_id: r.cart_item_id,
    quantity: r.quantity,
    added_at: r.added_at,
    product: {
      id: r.product_id, name: r.name, price: r.price,
      original_price: r.original_price,
      image_url: r.image_url, thumb_url: r.thumb_url, stock: r.stock,
      category: r.category_slug ? { slug: r.category_slug, name: r.category_name } : null
    },
    subtotal: Number((r.quantity * r.price).toFixed(2))
  }));
  const total = Number(items.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
  const total_items = items.reduce((s, i) => s + i.quantity, 0);
  return { items, total, total_items };
}

router.get('/', (req, res) => {
  const rows = db.prepare(SELECT_CART).all(req.user.id);
  res.json(shapeCart(rows));
});

router.post('/', (req, res) => {
  const { product_id, quantity = 1 } = req.body || {};
  if (!product_id) return res.status(400).json({ error: 'product_id es obligatorio' });
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  const product = db.prepare('SELECT id, stock FROM products WHERE id = ?').get(Number(product_id));
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  const existing = db
    .prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?')
    .get(req.user.id, product.id);

  if (existing) {
    const newQty = existing.quantity + qty;
    if (newQty > product.stock) {
      return res.status(409).json({ error: 'Stock insuficiente', available: product.stock });
    }
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, existing.id);
  } else {
    if (qty > product.stock) {
      return res.status(409).json({ error: 'Stock insuficiente', available: product.stock });
    }
    db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)')
      .run(req.user.id, product.id, qty);
  }

  const rows = db.prepare(SELECT_CART).all(req.user.id);
  res.status(201).json(shapeCart(rows));
});

router.put('/:cart_item_id', (req, res) => {
  const id = Number(req.params.cart_item_id);
  const { quantity } = req.body || {};
  const qty = parseInt(quantity, 10);
  if (!qty || qty < 1) return res.status(400).json({ error: 'quantity debe ser >= 1' });

  const item = db
    .prepare(`SELECT ci.*, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id
              WHERE ci.id = ? AND ci.user_id = ?`)
    .get(id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Ítem no encontrado en tu carrito' });
  if (qty > item.stock) {
    return res.status(409).json({ error: 'Stock insuficiente', available: item.stock });
  }

  db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(qty, id);
  const rows = db.prepare(SELECT_CART).all(req.user.id);
  res.json(shapeCart(rows));
});

router.delete('/:cart_item_id', (req, res) => {
  const id = Number(req.params.cart_item_id);
  const info = db
    .prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?')
    .run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Ítem no encontrado' });
  const rows = db.prepare(SELECT_CART).all(req.user.id);
  res.json(shapeCart(rows));
});

router.delete('/', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
  res.json({ items: [], total: 0, total_items: 0 });
});

module.exports = router;
