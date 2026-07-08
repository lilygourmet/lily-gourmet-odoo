-- ============================================================
-- Stock de poly découpé (morceaux), par TAILLE (diamètre) × HAUTEUR.
-- Conversion : poly 1 = 5 cm, 0,5 = 2 cm. Hauteur stockée = 5 ou 2.
-- stock_base = nombre de morceaux au moment base_date (inventaire / découpe).
-- Stock réel affiché = stock_base − consommation des gâteaux livrés APRÈS base_date.
-- ============================================================
create table if not exists poly_stock (
  id          uuid primary key default gen_random_uuid(),
  taille_cm   int not null,           -- 15, 20, 25, 30...
  hauteur_cm  int not null,           -- 5 ou 2
  stock_base  numeric not null default 0,
  base_date   timestamptz not null default now(),
  min         numeric not null default 0,
  max         numeric not null default 0,
  updated_at  timestamptz default now(),
  updated_by  uuid,
  unique (taille_cm, hauteur_cm)
);

alter table poly_stock enable row level security;
drop policy if exists poly_stock_rw on poly_stock;
create policy poly_stock_rw on poly_stock for all to authenticated using (true) with check (true);

-- Lignes de départ (tailles courantes × 5 cm / 2 cm) avec min/max indicatifs
-- (basés sur l'analyse : 20 cm et 15 cm = l'essentiel). À ajuster ensuite dans l'app.
insert into poly_stock (taille_cm, hauteur_cm, min, max) values
  (15, 5, 41, 82), (15, 2, 19, 38),
  (20, 5, 49, 98), (20, 2, 17, 34),
  (25, 5, 19, 38), (25, 2, 10, 20),
  (30, 5, 4, 8),   (30, 2, 3, 6),
  (35, 5, 0, 0),   (35, 2, 0, 0),
  (40, 5, 0, 0),   (40, 2, 0, 0)
on conflict (taille_cm, hauteur_cm) do nothing;
