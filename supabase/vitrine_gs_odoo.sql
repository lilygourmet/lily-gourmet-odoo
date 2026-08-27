-- Vitrine Salé → Odoo (GS- fabriqués à l'annexe)
-- ---------------------------------------------------------------------------
-- Quand la vitrine salée déclare des boîtes prêtes, l'app crée dans Odoo
-- l'ordre de fabrication (validé, à l'annexe) et le transfert annexe → vente
-- (laissé en brouillon). On garde ici le compte-rendu, ligne par ligne :
--   • odoo_of        : n° de l'ordre de fabrication créé
--   • odoo_transfert : n° du transfert en brouillon à valider dans Odoo
--   • odoo_message   : ce qui a coincé, s'il y a eu un souci (sinon vide)
-- odoo_of sert aussi d'aiguillage : une ligne qui en a un ne va PLUS dans le
-- devis « Vitrine GS » (nouveau circuit) ; les autres gardent l'ancien.

alter table stock_day_items
  add column if not exists odoo_of        text,
  add column if not exists odoo_transfert text,
  add column if not exists odoo_message   text;
