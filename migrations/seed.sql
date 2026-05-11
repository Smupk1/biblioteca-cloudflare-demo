-- Datos de ejemplo para probar la app rápido
-- Aplicar con: pnpm db:seed:local

INSERT INTO books (titulo, autor, anio, genero, disponible) VALUES
  ('Cien años de soledad', 'Gabriel García Márquez', 1967, 'Realismo mágico', 1),
  ('Rayuela', 'Julio Cortázar', 1963, 'Novela', 1),
  ('Ficciones', 'Jorge Luis Borges', 1944, 'Cuento', 1),
  ('La ciudad y los perros', 'Mario Vargas Llosa', 1963, 'Novela', 0),
  ('Pedro Páramo', 'Juan Rulfo', 1955, 'Novela', 1);
