-- ============================================================
-- Inventaire : se souvenir de ce qui est DÉJÀ parti dans Odoo.
--
-- Sans ça, un comptage envoyé restait « fait » dans l'écran : au comptage
-- suivant on ne savait plus ce qui avait déjà été porté chez Odoo, et
-- « Vers Odoo » renvoyait tout, y compris des chiffres périmés.
--
-- envoye_le        : quand la ligne est partie chez Odoo
-- quantite_envoyee : le chiffre qui est parti (il reste affiché en gris,
--                    comme référence, pendant qu'on recompte)
--
-- Une ligne est « à envoyer » quand compte_le > envoye_le — donc dès que
-- quelqu'un la recompte, elle repart dans la liste toute seule.
-- ============================================================

alter table inventaire_comptages
  add column if not exists envoye_le        timestamptz,
  add column if not exists quantite_envoyee numeric;

-- Retrouver vite ce qui reste à envoyer pour un lieu.
create index if not exists inventaire_comptages_envoi
  on inventaire_comptages (lieu, envoye_le);
