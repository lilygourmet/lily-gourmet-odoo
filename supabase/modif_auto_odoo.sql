-- Compte-rendu de ce que l'app a fait TOUTE SEULE dans Odoo quand un article
-- est retiré d'une commande confirmée (annulation des ordres de fabrication
-- de la ligne + de leurs enfants).
--
-- Colonne séparée de `description` À DESSEIN : `description` part dans la
-- notification WhatsApp, qui refuse les retours à la ligne dans une variable
-- de template. Le compte-rendu est multi-lignes → il lui faut son propre champ.

alter table modifications add column if not exists auto_odoo text;

comment on column modifications.auto_odoo is
  'Compte-rendu automatique des ordres de fabrication annulés dans Odoo (rempli par l''app, jamais saisi à la main).';
