// Carga datos iniciales: usuario admin, categorías y productos
const bcrypt = require('bcryptjs');
const db = require('./database');

require('./init');

function daysFromNow(d, h = 0, m = 0) {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(date.getHours() + h);
  date.setMinutes(date.getMinutes() + m);
  return date.toISOString();
}

const IMG = {
  copas:    'https://lh3.googleusercontent.com/aida-public/AB6AXuAWQwgo7r6ikuCFW-ePUnbHEL6viiadpPbOlgAoZwc1uBdNEs8O3xZwLN74ZlI_OxpXWjhULWcqjlvU717QOHage5OetccWu-ZOptjX22M6Nkv3SC4FMDkOTG3OMvul0pyMHgIifGNR2fm4swQ3urScW6CEkRCk56vJhPnxdVkl_ttpohEHfd01O8sLHSdvb7WrbEr-yEaOLvO6Syb4qdJZNxwHqN2HczkB_LROobjdrrLfkq0zw8wbnN97VSW1_gHAWVZDlLsb9ZI',
  macetero: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPZM4jHrcDZjZr1XnvZSCXzZyyDtshHRg7Lav71saM1Bchgi0pSJHcMd-q1a6WjDIoBnm6rDcHIoVk6DWESul3wWYkFNb9xVLJU4UE71L6jLNq8CJrlqM0OigCMbdhlnkg0wRP5LY2LounmNHk-rzbhEwmRdKfPG6fRrs3Nm8fKQpc1JZi9-Y8FOgZ2EAZTI_OVAueF70EWXxgamWBZUvgXM9qlhOIyFa0pQLaFR0CraTSB2PCfDIktmCGDm82IwQoLcKWB0_uh_Q',
  toallas:  'https://lh3.googleusercontent.com/aida-public/AB6AXuBOmQ_sppS7Mp6PJ46yNq141MFTRD6DqcZcTb2oS2snrlZOvQYaWtNqhxfAQVg9qqXghc5dCbnKTTjt6WVYIBWzI7QQaND8phoX6Esb5HVUNbEScKWAR3gMf1TfhmDynXyzWWaQ21UAVh5Qelx-CinQSmSKhHiwCpj2DNMBZ14y6663XV1Pc4Dt8ug318o3dmlgD8D0Pz3ncHAVpnfLidru-_evS4_taPycro8bMGP-g-MImNLwfQh3f9kHfVM8y7CtOSa8zKDzVyM',
  vela:     'https://lh3.googleusercontent.com/aida-public/AB6AXuCAp1tQgxgfhjPLWKLzeO-YQf8pOO5F7n8H61Gy8x_TGzjBkWSzMkx_2XFs3_R7AZ5CuJdXduCPOpDGrYVHYs6GgDVOEoNDdZdCKR7TvBkHj8jRictdcbTC2MDythTvEx57L_xDmi8FGUZ75Uk80xuRgBJy_kWGoY8QuCJO7qreg5MUDSJBrTKUm5He3Ekyna4Ns-NIPVOPd22Xxa3ioVZBq_b8GWvtl76_Zwac-ZKMwjs2qdeKdobaNzokxBQS6rtuvnOxvc0Yick',
  cubiertos:'https://lh3.googleusercontent.com/aida-public/AB6AXuCCDONVZaTbhC5pnvM0sLuaMLdiqP3oNX2OGM7EJiF2y9_pw4V-6XETUZEw5cBWdOLO1ZYRr5MRMZ37s0ZsoNbMogTWxC9M9_z0HniEE9aIk_zBSf2uGBsQwOZtY77qBqEkrZT3Z2iZb6CacOFwDokm2XivyXDQSIjbt6oOKTZF3evoPl2TnSjzC4LImJuN7X6mHkHV_GTSCn8kgRyKJfnplkG6F4-MAq5RqMgbD_vrqKP8K2WjUIl6KefEnf1Qodbw9Sp-F4yDXSg',
  tazas:    'https://lh3.googleusercontent.com/aida-public/AB6AXuCVm74mWimLsM3SRxqwonCGQy-FJQdiYwM7559vFDcICaOX7w4RrEAUbVKJS5kEMy8nckp3VDISWZIa6ZUje_0SxNxgIHuCBdkJHf6c0WVTCukLG-ucGieAiecV26c3__1gBi2_yLVwkTpf0xt62AL4rKzIVf0f7D2ayjIFLjZTKy61eSjgcuTkPkhN61LoV5_L4rz-y8M35jh-LBsJwtKkHSDMCJ6ax8kufd_k0E4AnxWX_RbaVX0XrFTZS0bdZYwUvaNDEGDowpw',
  mantel:   'https://lh3.googleusercontent.com/aida-public/AB6AXuDLj_ne3Umae80SVrMJlmYBnrwlJJxhrdFyHNisnvW7NKWY9s4OZiHK-C_hlJb4_zgtrs5HKIq1BhmK4_tuN9l3NwNb7oGa5NG33TWOflvuZq_R4H93Pf6upaOfNiFwGdB5JwW0r_W-ecO499tiBv3Ai6lBt-imjU3-Wi3Llcu3oA9ovO-kZrSR7Dlhimi1U-QCoGxClxS6E60_G1YS5SIU5iKDXZymWuJqXrjwMrFJh4_-rTYLO0ehvoEir-jrmbxld31eblXe1ow',
  lampara:  'https://lh3.googleusercontent.com/aida-public/AB6AXuBCKRogXhlfGDDJvWXcdPRRd9RHwFy-2D8_3NvYSsBa8Yzwv6ktWr7_tCY3sDY0qHn6YkXhI7d8ubwu8VFQHT0P1WbveIlfr4tgbIOV71twXCD6En_VOOHppWWUC_PVkI_Q5zy7WGv6EQ0ANwxE0wBH1_JHPwHWmHHRJnJcqWhDfGCx3XidP7gLpYXeSHRvQgSOuBL5lvh5sx7LigtceKpiDwJpIdKdfmWAQp2MVBrvczjCsvK1arb5cq0vu_SsJZECIZU7XlRfjos',
  cesta:    'https://lh3.googleusercontent.com/aida-public/AB6AXuDJkt_CFOmiUsnTwG-N--eTokcF5FFhKZdL0XHHvoAkfxWJvmvM5D20J7NXLAu46wIfVnayB4qd-I1LS6MR81IkRFnru1JW-u8ar_pfAlgJNhvH2sVRFnKr7TMY0cxenK9J7AoOHj3JdGNs8LWmTVBn21o1780S6UEYZ45NEse6nSi8QsUKmEDVdSe1FGNmgX5m8iMd-zBQjPG27SxI9KuK1KyTATkEbmFv2yA2sOO280-TLaMWNlm2H53uVxmIhOxo5kKLSwL-8lw',
  espejo:   'https://lh3.googleusercontent.com/aida-public/AB6AXuBZDbeXwnZMN_eLxhovOJjCybw1uuFsu1LdyEfim0ssSGN6-1ic48jaXDL_m_mq2DZdUXIrUx8D70bvM069P6HTOCDgqoNYps5ZO39PV6h_TTTG-OvJz7d6EciLZSz8VT6FNmwKeT0jzznbeiBSYEmSbBDiBA-Je_7IkJX-Wi1zZeUX-XuRx7IdzXYQCBwhs2srH_hnUXZZebFbSVwTQ8s0QwPB6_d8aTsqVvrhBxg_1-8JxhskV4Ad4FFt4N04l2fNubH1ZG_G0tY',
  jarrones: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB1ojmmUVHjrRyeviXB0EaQkyONTUXPwe0x2s_8p68lcGjUZ69xvPJLgPtMg6rIuQfmUUIrd9MlB_sCoEOUWmFtnARTR6oIJifLWM3HBwZcUvzOywzst2EFFTmqWwbUY3IKRUIcMa7ypum8ESGlzV9qt0Sun5ylrUG2USU0RMaGU0zmrVQnUAoN8vDhk8AAmtmNm7pX6HNmcIKDAaB_NZYjdRkKVvOqAfYZVCgqB5ca9GW3UR6bMAe6EDTSoDFoaJyfPtJP1a7vvX8',
  reloj:    'https://lh3.googleusercontent.com/aida-public/AB6AXuCBvBbkQHGrXl1r3FGSGkdI7SbjSwe6SxXqNeMRptywufJs6dbeLkJfUeauq2kwBDV2FMIeO0AR8AUPimUmTava0JHDeC7grI1K63w5HG4WsP9LijrF04lw3lfuPYs7g7YL-uV75r8ClbD6yOdnfaaxaHJ54fhG2h8fk8l1qYHJ3hO2TvszVWZDTTZKpb-6RS8qCn3XRrBAOgCXZMdxVDlRyfQTpgii46z2AveWLZmbYW8Qu4auKmvnCc3T5MSmjk6UD4dhK4hJX2c'
};

const CAT_IMG = {
  cocina:       'https://lh3.googleusercontent.com/aida-public/AB6AXuCerCPabg6qwpj7j7VgqG3Ids2pIB_2kO_zzez5DWYHwH0QIQkacHEuNlG3jQoqnoczC0Nf0U4ayAgP8-1aEP5wRrZFVaUQYPQ-WN7El_9UNA5WS6T8yxktv1EdsjUcEPQ39tR-t2mW3ObUqNkR_iBXriUzEmchmm7LY92DLWA6eOdnwrKic-IXau_WjXQPSoCM5vUw3RbWbb7NLV-eO5upbgMSoEuqVrNSALpFC8tIarGj4BQWO9gC3KgPNtvpbJxJ9UIC3jTRj30',
  decoracion:   'https://lh3.googleusercontent.com/aida-public/AB6AXuC0gKz9Q6NLDOyl2C0ixWI_rNsGRpikGPdW7IraPF8yM-ssgDD5iE-pX1EjiWGLcj6BMcuwzhLqbB5nTsEGH-9qjUx1JNFu4DwNczezRZZFNP5ds32xeNxYQDjWEfGsYl4boHVi1q_26PcMLtR-5mp9KupTVM3B2-UsZBFfUaG0Z_1QrWv8aPtoRHyrp26TaVYghfhBAjutdmic1rMvtSCDwxJs2sSxusjy1U9JOP1D4ejGMOWdM7sJxoi10shWh-rMd7Sb-Ox7kNw',
  jardin:       'https://lh3.googleusercontent.com/aida-public/AB6AXuBiOLZt5ccGD-nRMcPdYjOifq8WwnBKL4GeCeLXRHLVTaKgIhjm4Rm6aRiiZ61PIkoQS4Ki1pz9TdNovvum1zYGR8hoMTzmHVkM5Gc7zEPOQnVGNI79DfxXTt2I9_9VsQXjxx9qK7DtNDWTZR39AYRbaieXk1L0kfj9F_N-2ruQLck3TaiTvmG9PU5-41unP1BJUpayO7AQ11yXfBu8e4v881gzCWHL3Xx5rnQD15TEwrSUQpHecUBHnNNdvpYWbgdiDxjVKR_VnYg',
  textiles:     'https://lh3.googleusercontent.com/aida-public/AB6AXuCn_EQap--fNx-vekuEIDN5zEr-F3MghBBr7XvyZqsU_JsR1v1angEyP5i1kJuyTvxjsXpABde2XYYRiZzfhpPsbPdsYd_faoss3yrpfIhh-wz771OMrXMv_IftNL6rdwwu_std5ssfoh7hVO0HoIwCdKD0sOhVmlqhUJKL7tO4XzqkKuJuY-rX5H2J3cDgzpJfhbXVINtw2nGGqAIS6Qi77VceLI0LZ2FljiXbOja7VInwvMDIs01JuEQXaKIxOQx7E_5HiGCkDMM',
  vajilla:      'https://lh3.googleusercontent.com/aida-public/AB6AXuCdtl4BlZaKwpHaVSQGROkYqQSRV8-7r_NqsfFNm1ZBZ0DpnmvEM8uLH-Ce0nTr1ZvEBaOvQc8Dnf8ETAacE5BirUu30u1zamiP2c2F-CFSQVHj4gXXwnt1iuHOEm84U2180RZmS0-Zyv_1oUcWX7Ekh_nzWumSZOUL7gc6mSl0OyQcWUmFKeKrYtjiSvc54180paESOcy58vx1BXMvBjKvI0PMPbOsIK1ByXZhh4ooqOAZdxFsbNbCnOTjPoATtWb64s-YL_XG-qw',
  organizacion: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBy0mPnCuQd4o-ayj9n83tj4XFmXEtACSfygjxTJ4aucC1BeKP6KfK2htou2bxh_NBrPp3gbfqNWZPf--vRiFNO8uFNnBhBztamM2EY09vA7fLFYcYGirb6ONiN00oNhtTfSiQlX5sCmLEZ_7bmQJY0VGp53IAUdseh9pIyPdt0Iv0Zv_Yzjm8ZjgYfCmEBlQiaAUa8rpobKw65WqazaWZkcFt5dmQjxv8cm34TwqZvIHqMPM9aFevcLVjC4rG77k1Sgr7c9OKT4lc'
};

db.exec('BEGIN');
try {
  db.exec(`
    DELETE FROM cart_items;
    DELETE FROM favorites;
    DELETE FROM uploads;
    DELETE FROM products;
    DELETE FROM categories;
    DELETE FROM users WHERE email = 'admin@bazar.com';
  `);

  const adminHash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`
  ).run('Admin Bazar', 'admin@bazar.com', adminHash);

  const cats = [
    ['cocina', 'Cocina & Comedor', CAT_IMG.cocina],
    ['decoracion', 'Decoración', CAT_IMG.decoracion],
    ['jardin', 'Jardín y Exterior', CAT_IMG.jardin],
    ['textiles', 'Textiles', CAT_IMG.textiles],
    ['vajilla', 'Vajilla', CAT_IMG.vajilla],
    ['organizacion', 'Organización', CAT_IMG.organizacion]
  ];
  const insertCat = db.prepare('INSERT INTO categories (slug, name, image_url) VALUES (?, ?, ?)');
  const catIds = {};
  for (const [slug, name, img] of cats) {
    catIds[slug] = Number(insertCat.run(slug, name, img).lastInsertRowid);
  }

  const productos = [
    // [name, descripcion, price, original, img, category, stock, is_new, is_featured, sale_ends_at]
    ['Set de Copas de Cristal (4 uds.)', 'Elegante set de 4 copas de cristal tallado, ideales para vino tinto o blanco.', 19.99, 25.00, IMG.copas, 'vajilla', 25, 0, 1, daysFromNow(4, 18, 25)],
    ['Macetero de Cerámica "Oasis"', 'Macetero de cerámica esmaltada en color turquesa, perfecto para interior.', 17.50, 25.00, IMG.macetero, 'jardin', 18, 0, 1, daysFromNow(1, 6, 10)],
    ['Juego de Toallas "Suavidad"', 'Toallas de algodón egipcio en color gris, ultra suaves y absorbentes.', 39.99, 50.00, IMG.toallas, 'textiles', 30, 0, 1, daysFromNow(0, 12, 45)],
    ['Vela Aromática "Bosque Encantado"', 'Vela aromática en vaso de cristal con tapa de madera. Aroma a pino y cedro.', 15.99, 19.99, IMG.vela, 'decoracion', 40, 0, 1, daysFromNow(2, 9, 30)],
    ['Set Cubiertos Dorados (16 uds.)', 'Set de 16 cubiertos con acabado dorado satinado. Para 4 personas.', 35.50, 45.00, IMG.cubiertos, 'vajilla', 12, 0, 1, daysFromNow(3, 21, 59)],
    ['Tazas de Cerámica Artesanal', 'Juego de tazas de cerámica en tonos pastel, hechas a mano.', 12.99, null, IMG.tazas, 'vajilla', 50, 1, 0, null],
    ['Mantel de Lino "Florecer"', 'Mantel de lino con estampado floral, 150x250cm.', 29.99, null, IMG.mantel, 'textiles', 22, 1, 0, null],
    ['Lámpara de Mesa Nórdica', 'Lámpara con base de madera y pantalla de tela beige.', 45.00, null, IMG.lampara, 'decoracion', 15, 1, 0, null],
    ['Cesta de Mimbre Natural', 'Cesta de almacenaje de mimbre natural tejido a mano.', 22.00, null, IMG.cesta, 'organizacion', 35, 1, 0, null],
    ['Espejo Redondo "Sol"', 'Espejo redondo con marco dorado en forma de sol. 60cm.', 55.00, null, IMG.espejo, 'decoracion', 8, 1, 0, null],
    ['Set de Jarrones "Tierra"', 'Set de 3 jarrones de cerámica en tonos terracota.', 38.50, null, IMG.jarrones, 'decoracion', 14, 1, 0, null],
    ['Reloj de Pared Minimalista', 'Reloj de pared de diseño minimalista, color blanco, 30cm.', 32.00, null, IMG.reloj, 'decoracion', 20, 1, 0, null]
  ];

  const insertProd = db.prepare(
    `INSERT INTO products (name, description, price, original_price, image_url, category_id, stock, is_new, is_featured, sale_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [name, desc, price, orig, img, cat, stock, isNew, isFeat, sale] of productos) {
    insertProd.run(name, desc, price, orig, img, catIds[cat] || null, stock, isNew, isFeat, sale);
  }

  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

const counts = {
  users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  categories: db.prepare('SELECT COUNT(*) as c FROM categories').get().c,
  products: db.prepare('SELECT COUNT(*) as c FROM products').get().c
};

console.log('OK - Seed completado:', counts);
console.log('Admin login -> email: admin@bazar.com, password: admin123');
