// Endpoints de categorías
const express = require('express');
const db = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', (_req, res) => {
  const cats = db
    .prepare('SELECT id, slug, name, image_url FROM categories ORDER BY name')
    .all();
  res.json({ categories: cats });
});

router.get('/:slug', (req, res) => {
  const cat = db
    .prepare('SELECT id, slug, name, image_url FROM categories WHERE slug = ?')
    .get(req.params.slug);
  if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json({ category: cat });
});

router.post('/', authMiddleware, adminMiddleware, (req, res) => {
  const { slug, name, image_url } = req.body || {};
  if (!slug || !name) {
    return res.status(400).json({ error: 'slug y name son obligatorios' });
  }
  try {
    const info = db
      .prepare('INSERT INTO categories (slug, name, image_url) VALUES (?, ?, ?)')
      .run(slug, name, image_url || null);
    const cat = db
      .prepare('SELECT id, slug, name, image_url FROM categories WHERE id = ?')
      .get(Number(info.lastInsertRowid));
    res.status(201).json({ category: cat });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe una categoría con ese slug' });
    }
    throw e;
  }
});

router.put('/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });

  const slug = req.body?.slug ?? existing.slug;
  const name = req.body?.name ?? existing.name;
  const image_url = req.body?.image_url ?? existing.image_url;

  db.prepare('UPDATE categories SET slug = ?, name = ?, image_url = ? WHERE id = ?')
    .run(slug, name, image_url, id);

  const cat = db.prepare('SELECT id, slug, name, image_url FROM categories WHERE id = ?').get(id);
  res.json({ category: cat });
});

router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json({ ok: true });
});

module.exports = router;
