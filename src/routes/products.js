// Endpoints de productos
const express = require('express');
const db = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

function mapProduct(p) {
  if (!p) return p;
  const onSale = !!(p.original_price && p.price < p.original_price &&
    (!p.sale_ends_at || new Date(p.sale_ends_at).getTime() > Date.now()));
  let discount_percent = null;
  if (p.original_price && p.original_price > 0) {
    discount_percent = Math.round(((p.original_price - p.price) / p.original_price) * 100);
  }
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    original_price: p.original_price,
    image_url: p.image_url,
    thumb_url: p.thumb_url,
    video_url: p.video_url,
    stock: p.stock,
    is_new: !!p.is_new,
    is_featured: !!p.is_featured,
    on_sale: onSale,
    discount_percent,
    sale_ends_at: p.sale_ends_at,
    category: p.category_id
      ? { id: p.category_id, slug: p.category_slug, name: p.category_name }
      : null,
    created_at: p.created_at
  };
}

const SELECT_PRODUCT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

router.get('/', (req, res) => {
  const where = [];
  const params = [];

  if (req.query.category) {
    where.push('c.slug = ?');
    params.push(String(req.query.category));
  }
  if (req.query.q) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like);
  }
  if (req.query.is_new === '1' || req.query.is_new === 'true') {
    where.push('p.is_new = 1');
  }
  if (req.query.on_sale === '1' || req.query.on_sale === 'true') {
    where.push('p.original_price IS NOT NULL AND p.price < p.original_price');
    where.push('(p.sale_ends_at IS NULL OR p.sale_ends_at > ?)');
    params.push(new Date().toISOString());
  }
  if (req.query.featured === '1' || req.query.featured === 'true') {
    where.push('p.is_featured = 1');
  }

  const sortMap = {
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    newest: 'p.created_at DESC',
    name: 'p.name ASC'
  };
  const sort = sortMap[req.query.sort] || 'p.created_at DESC';

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  let sql = SELECT_PRODUCT;
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ` ORDER BY ${sort} LIMIT ? OFFSET ?`;

  const queryParams = [...params, limit, offset];
  const rows = db.prepare(sql).all(...queryParams);

  let countSql = 'SELECT COUNT(*) AS total FROM products p LEFT JOIN categories c ON c.id = p.category_id';
  if (where.length) countSql += ' WHERE ' + where.join(' AND ');
  const total = db.prepare(countSql).get(...params).total;

  res.json({
    products: rows.map(mapProduct),
    pagination: { total, limit, offset }
  });
});

router.get('/deals', (_req, res) => {
  const rows = db.prepare(`${SELECT_PRODUCT}
    WHERE p.original_price IS NOT NULL
      AND p.price < p.original_price
      AND (p.sale_ends_at IS NULL OR p.sale_ends_at > ?)
    ORDER BY p.sale_ends_at ASC`)
    .all(new Date().toISOString());
  res.json({ products: rows.map(mapProduct) });
});

router.get('/new', (_req, res) => {
  const rows = db.prepare(`${SELECT_PRODUCT} WHERE p.is_new = 1 ORDER BY p.created_at DESC`).all();
  res.json({ products: rows.map(mapProduct) });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const row = db.prepare(`${SELECT_PRODUCT} WHERE p.id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ product: mapProduct(row) });
});

function validateProductBody(body) {
  const errors = [];
  if (!body) errors.push('Body vacío');
  if (!body?.name) errors.push('name es obligatorio');
  if (body?.price == null || isNaN(Number(body.price))) errors.push('price es obligatorio y numérico');
  return errors;
}

router.post('/', authMiddleware, adminMiddleware, (req, res) => {
  const errs = validateProductBody(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });

  const {
    name, description = null, price, original_price = null,
    image_url = null, thumb_url = null, video_url = null,
    category_id = null, stock = 0,
    is_new = 0, is_featured = 0, sale_ends_at = null
  } = req.body;

  const info = db.prepare(
    `INSERT INTO products
     (name, description, price, original_price, image_url, thumb_url, video_url, category_id, stock, is_new, is_featured, sale_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, description, Number(price), original_price != null ? Number(original_price) : null,
    image_url, thumb_url, video_url,
    category_id, Number(stock), is_new ? 1 : 0, is_featured ? 1 : 0, sale_ends_at
  );

  const row = db.prepare(`${SELECT_PRODUCT} WHERE p.id = ?`).get(Number(info.lastInsertRowid));
  res.status(201).json({ product: mapProduct(row) });
});

router.put('/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

  const merged = {
    name: req.body?.name ?? existing.name,
    description: req.body?.description ?? existing.description,
    price: req.body?.price != null ? Number(req.body.price) : existing.price,
    original_price: 'original_price' in (req.body || {})
      ? (req.body.original_price != null ? Number(req.body.original_price) : null)
      : existing.original_price,
    image_url: req.body?.image_url ?? existing.image_url,
    thumb_url: req.body?.thumb_url ?? existing.thumb_url,
    video_url: req.body?.video_url ?? existing.video_url,
    category_id: 'category_id' in (req.body || {}) ? req.body.category_id : existing.category_id,
    stock: req.body?.stock != null ? Number(req.body.stock) : existing.stock,
    is_new: req.body?.is_new != null ? (req.body.is_new ? 1 : 0) : existing.is_new,
    is_featured: req.body?.is_featured != null ? (req.body.is_featured ? 1 : 0) : existing.is_featured,
    sale_ends_at: 'sale_ends_at' in (req.body || {}) ? req.body.sale_ends_at : existing.sale_ends_at
  };

  db.prepare(
    `UPDATE products SET name=?, description=?, price=?, original_price=?, image_url=?, thumb_url=?, video_url=?,
       category_id=?, stock=?, is_new=?, is_featured=?, sale_ends_at=? WHERE id=?`
  ).run(
    merged.name, merged.description, merged.price, merged.original_price, merged.image_url,
    merged.thumb_url, merged.video_url,
    merged.category_id, merged.stock, merged.is_new, merged.is_featured, merged.sale_ends_at, id
  );

  const row = db.prepare(`${SELECT_PRODUCT} WHERE p.id = ?`).get(id);
  res.json({ product: mapProduct(row) });
});

router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
