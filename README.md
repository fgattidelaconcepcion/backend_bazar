# Bazar Moderno — Backend API + Front + Panel Admin

API REST con **Node.js + Express + SQLite** (módulo `node:sqlite` nativo). Incluye:

- **Sitio público** (`/`) — Vidriera/catálogo, sin login. Buscador con autocompletado, filtros, modal de detalle.
- **Panel admin oculto** (`/admin`) — Login + gestión completa: productos, categorías, uploads.
- **API REST** (`/api/*`) — Endpoints públicos de catálogo + búsqueda + protegidos para admin.
- **Storage adapter** — Almacena en disco local (default) o en Cloudflare R2 si configurás las variables.

## Stack

- Node.js >= 22.5 (usa `node:sqlite`)
- Express 4
- JWT + bcryptjs
- multer + sharp para uploads e optimización de imágenes
- @aws-sdk/client-s3 (compatible con R2)

## Instalación rápida

```bash
npm install
cp .env.example .env       # cambiá el JWT_SECRET
npm run seed
npm start
```

URLs:
- <http://localhost:3000/> — sitio público
- <http://localhost:3000/admin> — panel admin (`admin@bazar.com` / `admin123`)
- <http://localhost:3000/api/health> — health check (devuelve `storage: local|r2`)

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `JWT_SECRET` | (cambiar) | Secret para firmar tokens |
| `JWT_EXPIRES_IN` | `7d` | Vencimiento del token |
| `DB_PATH` | `./src/db/bazar.db` | Ruta del archivo SQLite |
| `CORS_ORIGIN` | `*` | Orígenes permitidos |
| `UPLOADS_DIR` | `./uploads` | (storage local) carpeta de archivos |
| `PUBLIC_BASE_URL` | (vacío) | (storage local) Prefijo URL absoluto |
| `MAX_IMAGE_MB` | `10` | Tamaño máximo de imagen |
| `MAX_VIDEO_MB` | `100` | Tamaño máximo de video |
| `IMAGE_MAX_WIDTH` | `1600` | Resize máximo de imágenes |
| `IMAGE_QUALITY` | `80` | Calidad WebP |
| `THUMB_WIDTH` | `400` | Ancho del thumbnail |
| `R2_ACCOUNT_ID` | — | (R2) account ID de Cloudflare |
| `R2_ACCESS_KEY_ID` | — | (R2) access key |
| `R2_SECRET_ACCESS_KEY` | — | (R2) secret key |
| `R2_BUCKET` | — | (R2) nombre del bucket |
| `R2_PUBLIC_URL` | — | (R2) URL pública del bucket |

> Si **las 4 variables `R2_*`** están seteadas, el server usa R2 automáticamente; si no, usa disco local. La elección se imprime al arrancar (`Storage backend: ...`) y se ve en `/api/health`.

## Cloudflare R2 — Setup paso a paso

### 1. Crear el bucket

1. Entrá a Cloudflare Dashboard → **R2 Object Storage** → **Create bucket**.
2. Nombre del bucket: `bazar-moderno` (o el que prefieras). Dejá Location en automatic.
3. Click **Create bucket**.

### 2. Configurar acceso público al bucket

Por default los buckets son privados. Para que las imágenes se puedan ver desde el navegador del cliente, necesitás una de estas dos opciones:

**Opción A — Subdominio público de Cloudflare (rápido, gratis):**
1. Adentro del bucket → **Settings** → **Public access** → **Allow** en "R2.dev subdomain".
2. Te da una URL tipo `https://pub-XXXXX.r2.dev`. Esa va en `R2_PUBLIC_URL`.

**Opción B — Dominio propio (recomendado para producción):**
1. **Settings** → **Custom Domains** → **Connect Domain**.
2. Ej: `files.tudominio.com` (tu dominio tiene que estar en Cloudflare).
3. Esa URL va en `R2_PUBLIC_URL`.

### 3. Crear API Token con permisos sobre R2

1. Cloudflare Dashboard → **R2** → **Manage R2 API Tokens** → **Create API Token**.
2. Permissions: **Object Read & Write**.
3. Specify bucket: solo `bazar-moderno` (no le des acceso a todos los buckets).
4. TTL: lo que quieras (ej. 1 año).
5. Click **Create API Token**.
6. Cloudflare te muestra **una sola vez**: `Access Key ID` y `Secret Access Key`. **Copialos ya**.

### 4. Sacar el Account ID

1. Cualquier página del dashboard → barra lateral derecha → **Account ID**. Es un string hex de 32 caracteres.

### 5. Configurar `.env`

```bash
R2_ACCOUNT_ID=tu-account-id-de-32-chars
R2_ACCESS_KEY_ID=el-access-key
R2_SECRET_ACCESS_KEY=el-secret-key
R2_BUCKET=bazar-moderno
R2_PUBLIC_URL=https://files.tudominio.com    # o https://pub-XXXX.r2.dev
```

### 6. Reiniciar el server

```bash
npm start
```

Tiene que mostrar `Storage backend: Cloudflare R2 (bazar-moderno)`. Hacé un upload desde el panel admin y verificá que la URL devuelta sea `https://files.tudominio.com/images/xxxx.webp`.

> Las URLs viejas (locales) que estén en la DB de productos no se migran solas. Si querés migrar imágenes existentes, hay que rehacer los uploads desde el admin.

## Endpoints

### Auth
- `POST /api/auth/register` — `{name, email, password}`
- `POST /api/auth/login` — `{email, password}` (front admin filtra por `role=admin`)
- `GET  /api/auth/me`

### Catálogo (público)
- `GET /api/categories` / `GET /api/categories/:slug`
- `GET /api/products` — filtros: `?category=cocina&q=taza&on_sale=1&is_new=1&sort=price_asc&limit=20`
- `GET /api/products/deals`
- `GET /api/products/new`
- `GET /api/products/:id`

### Búsqueda (público)
- `GET /api/search?q=X` — devuelve `{products:[...], categories:[...]}` con matches case+accent insensitive. Ideal para autocomplete.

### Carrito y Favoritos (auth) — disponibles, no usados por el público actual
- `/api/cart`, `/api/favorites`

### Uploads (admin)
- `POST   /api/uploads/image` — `multipart/form-data`, campo `file`. Imagen optimizada a WebP + thumbnail.
- `POST   /api/uploads/video` — `multipart/form-data`, campo `file`. Sin transcoding.
- `GET    /api/uploads` — historial.
- `DELETE /api/uploads/:id` — borrar archivo y registro.

### Admin (rol `admin`)
- `POST/PUT/DELETE` en `/api/products[/:id]` y `/api/categories[/:id]`.

## Arquitectura del storage

```
src/storage/
├── index.js   ← elige adapter por env
├── local.js   ← guarda en /uploads/
└── r2.js      ← sube a Cloudflare R2 vía S3 SDK
```

El adapter expone:
- `saveBuffer(buffer, kind, filename, contentType)` — para imágenes ya procesadas en RAM
- `saveFromDiskPath(localPath, kind, filename, contentType)` — para videos (multer los guarda primero a disco temp)
- `delete(kind, filename)`

`kind` es `'images' | 'thumbs' | 'videos'`. El backend decide solo cuál usar según las env vars.

## Estructura

```
backend_bazar/
├── src/
│   ├── server.js
│   ├── db/{database,schema.sql,init,seed}.js
│   ├── middleware/auth.js
│   ├── routes/{auth,categories,products,cart,favorites,uploads,search}.js
│   └── storage/{index,local,r2}.js
├── public/index.html        # vidriera con autocompletado
├── admin/index.html         # panel admin
├── uploads/                 # solo si storage = local
├── package.json
├── .env.example
└── README.md
```

## Scripts npm

```bash
npm start         # producción
npm run dev       # auto-reload con --watch
npm run seed      # crea schema + datos de ejemplo
npm run init-db   # solo crea schema
```

## Deploy

- **Render.com**: agregá disco persistente solo si usás storage local. Con R2 no necesitás disco (la DB sigue siendo SQLite, podés ponerla en disco persistente o migrar a Postgres).
- **Fly.io**: idem, declará volumen para SQLite (o usá fly Postgres). Uploads van a R2.
- **Producción seria**: SQLite + R2 escala bien para sitios chicos/medianos. Si tenés muchos writes concurrentes a la DB, migrá a PostgreSQL.