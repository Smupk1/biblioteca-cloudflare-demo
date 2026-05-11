/**
 * UI mínima: una sola página con login + lista + form para agregar libros.
 * Servida como string desde el Worker para evitar configurar Assets binding.
 *
 * No es pretty, es funcional — para que los estudiantes vean cómo se conecta
 * un cliente con el backend sin distracciones de framework frontend.
 */

export const indexHtml = /* html */ `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Biblioteca · Cloudflare Workers Demo</title>
  <style>
    :root { --bg: #0f172a; --panel: #1e293b; --line: #334155; --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8; --danger: #f87171; --ok: #4ade80; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 32px 20px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: var(--accent); }
    .sub { color: var(--muted); margin-bottom: 24px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    form { display: grid; gap: 10px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    input, button { font: inherit; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--line); background: #0b1220; color: var(--text); }
    input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
    button { background: var(--accent); color: #0b1220; border: none; font-weight: 600; cursor: pointer; }
    button.secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
    button.danger { background: var(--danger); color: #0b1220; }
    .books { display: grid; gap: 10px; }
    .book { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 12px; background: #0b1220; border: 1px solid var(--line); border-radius: 6px; }
    .book h3 { margin: 0 0 4px; font-size: 16px; }
    .book .meta { color: var(--muted); font-size: 13px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .badge.ok { background: rgba(74,222,128,0.15); color: var(--ok); }
    .badge.no { background: rgba(248,113,113,0.15); color: var(--danger); }
    .actions { display: flex; gap: 6px; align-items: center; }
    .actions button { padding: 6px 10px; font-size: 13px; }
    .status { font-size: 13px; color: var(--muted); margin-top: 8px; min-height: 18px; }
    .status.err { color: var(--danger); }
    .status.ok { color: var(--ok); }
    .hidden { display: none; }
    code { background: #0b1220; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>📚 Biblioteca</h1>
  <p class="sub">Demo CRUD sobre Cloudflare Workers + D1 + Durable Objects.</p>

  <!-- AUTH PANEL -->
  <div class="panel" id="auth-panel">
    <h2 id="auth-title">Ingresar</h2>
    <form id="auth-form">
      <div class="row">
        <input type="email" id="email" placeholder="email@ejemplo.com" required />
        <input type="password" id="password" placeholder="password (mín 6)" required minlength="6" />
      </div>
      <div class="row">
        <button type="submit" id="login-btn">Login</button>
        <button type="button" class="secondary" id="register-btn">Registrar</button>
      </div>
    </form>
    <div class="status" id="auth-status"></div>
  </div>

  <!-- USER PANEL -->
  <div class="panel hidden" id="user-panel">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>Sesión: <code id="user-email"></code></div>
      <button class="secondary" id="logout-btn">Logout</button>
    </div>
  </div>

  <!-- NEW BOOK PANEL (solo si autenticado) -->
  <div class="panel hidden" id="new-book-panel">
    <h2>Nuevo libro</h2>
    <form id="new-book-form">
      <div class="row">
        <input type="text" id="b-titulo" placeholder="Título" required />
        <input type="text" id="b-autor" placeholder="Autor" required />
      </div>
      <div class="row">
        <input type="number" id="b-anio" placeholder="Año" />
        <input type="text" id="b-genero" placeholder="Género" />
      </div>
      <button type="submit">Agregar libro</button>
    </form>
    <div class="status" id="new-book-status"></div>
  </div>

  <!-- BOOKS LIST -->
  <div class="panel">
    <h2>Catálogo</h2>
    <div class="books" id="books-list">Cargando…</div>
  </div>

  <!-- STATS -->
  <div class="panel">
    <h2>Stats (desde el Durable Object)</h2>
    <div id="stats" class="sub">…</div>
    <button class="secondary" id="refresh-stats">Refrescar</button>
  </div>
</div>

<script>
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem('token');
  const setToken = (t) => t ? localStorage.setItem('token', t) : localStorage.removeItem('token');
  const setEmail = (e) => e ? localStorage.setItem('email', e) : localStorage.removeItem('email');

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token()) headers['Authorization'] = 'Bearer ' + token();
    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
    return data;
  }

  function setStatus(elId, msg, kind) {
    const el = $(elId);
    el.textContent = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function renderAuth() {
    const t = token();
    $('auth-panel').classList.toggle('hidden', !!t);
    $('user-panel').classList.toggle('hidden', !t);
    $('new-book-panel').classList.toggle('hidden', !t);
    if (t) $('user-email').textContent = localStorage.getItem('email') || '';
  }

  async function loadBooks() {
    try {
      const books = await api('/api/books');
      const list = $('books-list');
      if (books.length === 0) { list.innerHTML = '<div class="sub">Sin libros todavía.</div>'; return; }
      list.innerHTML = books.map(b => \`
        <div class="book" data-id="\${b.id}">
          <div>
            <h3>\${escape(b.titulo)} <span class="badge \${b.disponible ? 'ok' : 'no'}">\${b.disponible ? 'disponible' : 'prestado'}</span></h3>
            <div class="meta">\${escape(b.autor)} \${b.anio ? '· ' + b.anio : ''} \${b.genero ? '· ' + escape(b.genero) : ''}</div>
          </div>
          <div class="actions">
            \${token() ? \`
              <button class="secondary" data-action="toggle">Toggle</button>
              <button class="danger" data-action="delete">Borrar</button>
            \` : ''}
          </div>
        </div>
      \`).join('');
    } catch (e) { $('books-list').textContent = e.message; }
  }

  function escape(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  async function loadStats() {
    try { const s = await api('/api/stats'); $('stats').innerHTML = \`<code>\${s.totalBooks}</code> libros · <code>\${s.totalUsers}</code> usuarios · <code>\${s.activeSessions}</code> sesiones activas\`; }
    catch (e) { $('stats').textContent = e.message; }
  }

  // === Wire up ===
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    const password = $('password').value;
    try {
      const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(r.token); setEmail(r.email);
      setStatus('auth-status', 'Login OK', 'ok');
      renderAuth(); loadBooks(); loadStats();
    } catch (e) { setStatus('auth-status', e.message, 'err'); }
  });

  $('register-btn').addEventListener('click', async () => {
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || password.length < 6) { setStatus('auth-status', 'Completá email y password (mín 6)', 'err'); return; }
    try {
      await api('/api/register', { method: 'POST', body: JSON.stringify({ email, password }) });
      setStatus('auth-status', 'Usuario creado — ahora hacé login', 'ok');
    } catch (e) { setStatus('auth-status', e.message, 'err'); }
  });

  $('logout-btn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    setToken(null); setEmail(null);
    renderAuth(); loadBooks(); loadStats();
  });

  $('new-book-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      titulo: $('b-titulo').value.trim(),
      autor: $('b-autor').value.trim(),
      anio: $('b-anio').value ? Number($('b-anio').value) : undefined,
      genero: $('b-genero').value.trim() || undefined,
    };
    try {
      await api('/api/books', { method: 'POST', body: JSON.stringify(body) });
      setStatus('new-book-status', 'Libro agregado', 'ok');
      e.target.reset(); loadBooks(); loadStats();
    } catch (e) { setStatus('new-book-status', e.message, 'err'); }
  });

  $('books-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.closest('.book').dataset.id;
    const action = btn.dataset.action;
    try {
      if (action === 'delete') {
        if (!confirm('¿Borrar este libro?')) return;
        await api('/api/books/' + id, { method: 'DELETE' });
      } else if (action === 'toggle') {
        const card = btn.closest('.book');
        const isAvailable = card.querySelector('.badge').classList.contains('ok');
        await api('/api/books/' + id, { method: 'PUT', body: JSON.stringify({ disponible: !isAvailable }) });
      }
      loadBooks();
    } catch (e) { alert(e.message); }
  });

  $('refresh-stats').addEventListener('click', loadStats);

  // === Boot ===
  renderAuth();
  loadBooks();
  loadStats();
</script>
</body>
</html>`;
