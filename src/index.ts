/**
 * Biblioteca CRUD — Worker principal.
 *
 * Stack:
 *   - Hono (router)
 *   - D1 (SQL: usuarios + libros)
 *   - Durable Object SessionStore (tokens de sesión)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { html } from 'hono/html';
import { hashPassword, verifyPassword, generateToken } from './auth';
import { SessionStore } from './session-store';
import { indexHtml } from './ui';

export { SessionStore };

type Bindings = {
  DB: D1Database;
  SESSIONS: DurableObjectNamespace<SessionStore>;
};

type Variables = {
  userId: number;
  email: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('/api/*', cors());

// === Helper: obtener instancia del DO ===
// Usamos un nombre fijo "global" para que TODOS los tokens vivan en la misma instancia.
// En apps reales podrías hashear por usuario para escalar mejor.
function getSessionStore(env: Bindings) {
  const id = env.SESSIONS.idFromName('global');
  return env.SESSIONS.get(id);
}

// === Middleware de autenticación ===
const requireAuth = async (c: any, next: any) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'No autenticado' }, 401);
  }
  const token = auth.slice(7);
  const store = getSessionStore(c.env);
  const session = await store.getSession(token);
  if (!session) {
    return c.json({ error: 'Token inválido o expirado' }, 401);
  }
  c.set('userId', session.userId);
  c.set('email', session.email);
  await next();
};

// === UI ===
app.get('/', (c) => c.html(indexHtml));

// === Auth: registro ===
app.post('/api/register', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password || password.length < 6) {
    return c.json({ error: 'Email y password (mín 6 caracteres) requeridos' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) return c.json({ error: 'Email ya registrado' }, 409);

  const { hash, salt } = await hashPassword(password);
  const result = await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?) RETURNING id'
  )
    .bind(email, hash, salt)
    .first<{ id: number }>();

  return c.json({ id: result!.id, email });
});

// === Auth: login ===
app.post('/api/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) {
    return c.json({ error: 'Email y password requeridos' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash, salt FROM users WHERE email = ?'
  )
    .bind(email)
    .first<{ id: number; email: string; password_hash: string; salt: string }>();

  if (!user) return c.json({ error: 'Credenciales inválidas' }, 401);

  const ok = await verifyPassword(password, user.password_hash, user.salt);
  if (!ok) return c.json({ error: 'Credenciales inválidas' }, 401);

  const token = generateToken();
  const store = getSessionStore(c.env);
  await store.createSession(token, user.id, user.email);

  return c.json({ token, email: user.email });
});

// === Auth: logout ===
app.post('/api/logout', requireAuth, async (c) => {
  const auth = c.req.header('Authorization')!;
  const token = auth.slice(7);
  const store = getSessionStore(c.env);
  await store.deleteSession(token);
  return c.json({ ok: true });
});

// === Auth: a quién pertenece este token ===
app.get('/api/me', requireAuth, (c) => {
  return c.json({ userId: c.get('userId'), email: c.get('email') });
});

// === Books: listar (público) ===
app.get('/api/books', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, titulo, autor, anio, genero, disponible FROM books ORDER BY id DESC'
  ).all();
  return c.json(results);
});

// === Books: detalle (público) ===
app.get('/api/books/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const book = await c.env.DB.prepare(
    'SELECT id, titulo, autor, anio, genero, disponible FROM books WHERE id = ?'
  )
    .bind(id)
    .first();
  if (!book) return c.json({ error: 'No encontrado' }, 404);
  return c.json(book);
});

// === Books: crear (auth) ===
app.post('/api/books', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    titulo: string;
    autor: string;
    anio?: number;
    genero?: string;
    disponible?: boolean;
  }>();

  if (!body.titulo || !body.autor) {
    return c.json({ error: 'titulo y autor son requeridos' }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO books (titulo, autor, anio, genero, disponible, created_by)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
  )
    .bind(
      body.titulo,
      body.autor,
      body.anio ?? null,
      body.genero ?? null,
      body.disponible === false ? 0 : 1,
      userId
    )
    .first<{ id: number }>();

  return c.json({ id: result!.id, ...body }, 201);
});

// === Books: editar (auth) ===
app.put('/api/books/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    titulo?: string;
    autor?: string;
    anio?: number | null;
    genero?: string | null;
    disponible?: boolean;
  }>();

  const existing = await c.env.DB.prepare('SELECT id FROM books WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) return c.json({ error: 'No encontrado' }, 404);

  await c.env.DB.prepare(
    `UPDATE books SET
       titulo     = COALESCE(?, titulo),
       autor      = COALESCE(?, autor),
       anio       = COALESCE(?, anio),
       genero     = COALESCE(?, genero),
       disponible = COALESCE(?, disponible)
     WHERE id = ?`
  )
    .bind(
      body.titulo ?? null,
      body.autor ?? null,
      body.anio ?? null,
      body.genero ?? null,
      body.disponible === undefined ? null : body.disponible ? 1 : 0,
      id
    )
    .run();

  return c.json({ id, ...body });
});

// === Books: borrar (auth) ===
app.delete('/api/books/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const { meta } = await c.env.DB.prepare('DELETE FROM books WHERE id = ?')
    .bind(id)
    .run();
  if (meta.changes === 0) return c.json({ error: 'No encontrado' }, 404);
  return c.json({ ok: true });
});

// === Stats (demo: contar sesiones activas en el DO) ===
app.get('/api/stats', async (c) => {
  const store = getSessionStore(c.env);
  const activeSessions = await store.countActive();
  const books = await c.env.DB.prepare('SELECT COUNT(*) as n FROM books').first<{ n: number }>();
  const users = await c.env.DB.prepare('SELECT COUNT(*) as n FROM users').first<{ n: number }>();
  return c.json({
    activeSessions,
    totalBooks: books?.n ?? 0,
    totalUsers: users?.n ?? 0,
  });
});

export default app;
