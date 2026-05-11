# biblioteca-cloudflare-demo

Demo educativa de un **CRUD completo de biblioteca** usando el **stack gratuito de Cloudflare**: Workers + D1 + Durable Objects. Material pensado para una presentación a estudiantes universitarios.

> El objetivo no es construir la mejor biblioteca del mundo — es **mostrar tres primitivas de Cloudflare** (compute serverless, base de datos SQL distribuida y estado consistente) trabajando juntas en un solo proyecto, deployable a producción **sin pagar un peso**.

---

## ¿Qué se aprende con este proyecto?

1. **Cómo escribir un backend serverless con Hono** corriendo en Cloudflare Workers.
2. **Cómo usar D1** (SQLite distribuido) para persistencia con SQL real — migraciones incluidas.
3. **Cuándo y por qué usar Durable Objects** — acá lo usamos como store de sesiones de auth, que es el caso de uso canónico.
4. **Cómo deployar a edge globalmente** con un solo comando.
5. **Cómo hacer hashing de passwords seguro** usando la Web Crypto API nativa (sin bcrypt ni libs externas).

---

## Plan gratuito de Cloudflare — ¿qué entra?

| Servicio | Límite gratuito | Lo que usamos |
|---|---|---|
| **Workers** | 100,000 requests / día | Backend completo |
| **D1** | 5 GB · 25M lecturas/día · 50k escrituras/día | Tabla users + tabla books |
| **Durable Objects** | 1M requests/mes · 400k GB·s | 1 instancia para sesiones |

**Conclusión**: una clase entera puede tirar requests contra la app sin que cueste un peso.

---

## Stack

- **[Hono](https://hono.dev/)** — micro-framework tipo Express, hecho para edge runtimes
- **[Wrangler](https://developers.cloudflare.com/workers/wrangler/)** — CLI oficial de Cloudflare
- **TypeScript** — porque los tipos son disciplina, no decoración
- **HTML + CSS + JS vanilla** para la UI (servida desde el mismo Worker)

---

## Arquitectura

```
┌────────────────┐         ┌──────────────────────────────────┐
│                │         │  Cloudflare Worker (edge global) │
│  Navegador     │  HTTPS  │                                  │
│  (HTML+JS)     │────────▶│  ┌─────────────────────────┐     │
│                │         │  │  Hono Router            │     │
└────────────────┘         │  │  - /api/register        │     │
                           │  │  - /api/login           │     │
                           │  │  - /api/books (CRUD)    │     │
                           │  └────────────┬────────────┘     │
                           │               │                  │
                           │      ┌────────┴────────┐         │
                           │      ▼                 ▼         │
                           │  ┌────────┐      ┌──────────┐    │
                           │  │   D1   │      │    DO    │    │
                           │  │ (SQL)  │      │ Sessions │    │
                           │  └────────┘      └──────────┘    │
                           │  users, books      tokens         │
                           └──────────────────────────────────┘
```

**Flujo de autenticación:**

1. Cliente → `POST /api/login` con email/password
2. Worker verifica contra D1 (PBKDF2)
3. Worker pide al Durable Object que cree un token
4. Token vuelve al cliente, queda en `localStorage`
5. Requests futuros llevan `Authorization: Bearer <token>`
6. Middleware consulta al DO para validar antes de cada endpoint protegido

---

## Estructura del proyecto

```
biblioteca-cloudflare-demo/
├── src/
│   ├── index.ts          # Hono app: rutas y middleware
│   ├── session-store.ts  # Durable Object: store de sesiones
│   ├── auth.ts           # Hashing PBKDF2 + generación de tokens
│   └── ui.ts             # HTML+JS de la página
├── migrations/
│   ├── 0001_init.sql     # CREATE TABLE users + books
│   └── seed.sql          # Datos de ejemplo
├── wrangler.toml         # Config de Workers + bindings (D1, DO)
├── tsconfig.json
├── package.json
└── README.md
```

---

## Cómo correr el proyecto

### 1. Requisitos

- [Node.js](https://nodejs.org/) v18.17.1+
- [pnpm](https://pnpm.io/installation) (recomendado)
- Cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/sign-up) — solo para deploy, no para desarrollo local

### 2. Clonar e instalar

```bash
git clone https://github.com/Smupk1/biblioteca-cloudflare-demo.git
cd biblioteca-cloudflare-demo
pnpm install
```

### 3. Crear la base de datos local

Wrangler tiene un simulador local que corre D1 y Durable Objects en tu máquina, sin necesidad de conectarse a Cloudflare. Para que funcione:

```bash
# Aplicar migraciones a la DB local
pnpm db:migrate:local

# (Opcional) cargar datos de ejemplo
pnpm db:seed:local
```

### 4. Correr el Worker en local

```bash
pnpm dev
```

Abrí [http://localhost:8787](http://localhost:8787). Vas a ver:

- Un panel de login/registro
- La lista de libros del seed
- Stats que vienen del Durable Object

**Probalo:**
1. Click en "Registrar" con `test@example.com` y password `secreto123`
2. Click en "Login"
3. Agregá un libro nuevo
4. Click en "Refrescar" en stats — vas a ver que la sesión activa subió

### 5. Deploy a producción (Cloudflare Workers)

```bash
# Autenticarse (una sola vez)
pnpx wrangler login

# Crear la D1 en producción
pnpm db:create
# ↑ esto imprime un database_id — copialo y pegalo en wrangler.toml

# Aplicar migraciones en la D1 remota
pnpm db:migrate:remote

# Deploy del Worker
pnpm deploy
```

En menos de un minuto la app queda en:
`https://biblioteca-cloudflare-demo.<tu-subdominio>.workers.dev`

---

## Endpoints

| Método | Path | Auth | Descripción |
|---|---|---|---|
| POST | `/api/register` | ❌ | Crear usuario (email + password ≥ 6) |
| POST | `/api/login` | ❌ | Devuelve `{ token }` |
| POST | `/api/logout` | ✅ | Invalida el token actual |
| GET | `/api/me` | ✅ | Info del usuario logueado |
| GET | `/api/books` | ❌ | Listar todos los libros |
| GET | `/api/books/:id` | ❌ | Detalle de un libro |
| POST | `/api/books` | ✅ | Crear libro |
| PUT | `/api/books/:id` | ✅ | Editar libro (parcial) |
| DELETE | `/api/books/:id` | ✅ | Borrar libro |
| GET | `/api/stats` | ❌ | Conteo de libros, usuarios, sesiones activas |

**Probarlo con curl:**

```bash
# Registrar
curl -X POST http://localhost:8787/api/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com","password":"secreto123"}'

# Login → guardar token
TOKEN=$(curl -s -X POST http://localhost:8787/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com","password":"secreto123"}' | jq -r .token)

# Crear libro
curl -X POST http://localhost:8787/api/books \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"titulo":"El Aleph","autor":"Borges","anio":1949,"genero":"Cuento"}'

# Listar
curl http://localhost:8787/api/books
```

---

## Conceptos clave para discutir en la presentación

### 1. ¿Por qué Workers y no un servidor tradicional?

- **Edge computing**: el código corre en ~300 ciudades del mundo. Latencia mínima.
- **Sin servidor que mantener**: nada de Docker, systemd, ni "el server se cayó".
- **Cold starts <50ms** — vs. ~2s de AWS Lambda con Node.
- **Plan gratuito real**: 100k requests/día sin tarjeta.

### 2. ¿Por qué D1 y no Postgres?

- D1 es **SQLite distribuido** — SQL real, schema real, migraciones reales.
- Vive **en el mismo edge** que el Worker → latencia bajísima.
- Plan gratuito generoso para apps pequeñas/medianas.
- **Tradeoff**: no es la mejor opción para apps con muchísimas escrituras concurrentes.

### 3. ¿Por qué Durable Objects para sesiones?

Esta es **la pregunta más importante** de la demo. Discutir con los estudiantes:

- Si guardáramos los tokens en un `Map` de JavaScript, **se perderían entre requests** (porque cada request puede ejecutarse en un nodo distinto).
- Si los guardáramos en D1, funcionaría — pero cada validación de token sería una query SQL.
- Un **Durable Object** te da **un único punto consistente** en el mundo donde vive ese estado, con almacenamiento in-memory + persistencia automática.
- Es **el patrón canónico** para: sesiones, rate limiting, contadores, salas de chat, colaboración en tiempo real.

### 4. ¿Por qué PBKDF2 y no bcrypt?

- **bcrypt no funciona en Workers** (depende de bindings nativos de Node).
- **PBKDF2 está en la Web Crypto API**, disponible nativo en cualquier runtime moderno.
- Con 100k iteraciones es suficiente para una demo educativa (en producción real, considerar Argon2id vía WASM).

### 5. ¿Cuándo NO usar este stack?

Hablar honestamente con los estudiantes — no todo se resuelve con CF:

- ❌ Apps con **muchas escrituras concurrentes a la misma fila** (D1 tiene locks).
- ❌ Procesos **largos** (Workers tienen límite de CPU por request).
- ❌ Apps que necesitan **conexiones persistentes** (WebSockets sí funcionan, pero con DO).
- ❌ Cuando necesitás **Postgres específicamente** por extensiones (pgvector, PostGIS, etc.).

---

## Licencia

MIT — ver [LICENSE](./LICENSE).

Cloná, modificá, usalo en tu clase o como base para tu propio proyecto.
