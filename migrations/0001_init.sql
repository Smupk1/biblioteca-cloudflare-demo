-- Migration 0001: schema inicial de la biblioteca
-- Aplicar con: pnpm db:migrate:local  (o :remote para producción)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  salt          TEXT    NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo      TEXT    NOT NULL,
  autor       TEXT    NOT NULL,
  anio        INTEGER,
  genero      TEXT,
  disponible  INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by  INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_books_autor  ON books(autor);
CREATE INDEX IF NOT EXISTS idx_books_genero ON books(genero);
