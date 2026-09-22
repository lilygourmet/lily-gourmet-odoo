-- ============================================================
-- LA PERMISSION « REBUTS » — qui a le droit de jeter.
--
-- « Celui qui a la perm des rebuts / crée un onglet rebut » (Layla,
-- 2026-09-22), après avoir demandé à pouvoir décider du sort d'un reste de
-- cuve : « 140 Subleme en rebut ? ou à intégrer dans le reste ».
--
-- ⚠️ JETER NE SE RATTRAPE PAS. Un rebut sort la marchandise du stock pour de
-- bon — c'est un vrai `stock.scrap` chez Odoo, avec son numéro SP/…, depuis le
-- Stock Prod annexe vers « Virtual Locations/Scrap ». C'est le seul geste de
-- ces écrans qu'on ne peut pas défaire depuis l'app.
--
-- Elle ouvre deux choses :
--   • l'onglet 🗑 Rebut — ce qui a été jeté, et jeter à la main ;
--   • le choix « je le garde / au rebut » à la fin d'un dispatch « À finir ».
--
-- ⚠️ Personne ne perd rien : cette permission n'existait pas, rien ne changeait
-- de main. Tant qu'elle est à `false`, l'écran reste exactement comme avant —
-- le reste retourne au frigo, sans qu'on demande.
-- ============================================================
alter table profiles add column if not exists perm_rebuts boolean not null default false;

comment on column profiles.perm_rebuts is
  'Onglet « Rebut » et droit de jeter un reste de cuve (stock.scrap chez Odoo).';
