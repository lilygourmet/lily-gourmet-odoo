-- ============================================================
-- LE CRÉNEAU PROMIS AU CLIENT, GARDÉ CHEZ NOUS.
--
-- Odoo possède le champ `livraison_hour` et le RECALCULE tout seul à partir de
-- l'heure de préparation : heure arrondie, créneau d'une heure. Vérifié sur
-- 3 000 commandes, et sur 12 000 commandes d'historique il n'existe pas un
-- seul créneau de 2 h — le nôtre était écrasé à chaque écriture.
--
-- On garde donc le créneau ici, dans une table qui nous appartient. Odoo ne
-- peut plus le toucher. Format : « 13h-15h ».
--
-- Une commande saisie DIRECTEMENT dans Odoo n'aura pas de créneau : c'est
-- voulu. Là, l'heure d'Odoo est déjà l'heure promise au client (règle de
-- Layla, 2026-09-15), et l'écran la lit telle quelle.
-- ============================================================
alter table livraisons add column if not exists creneau text;

comment on column livraisons.creneau is
  'Créneau de 2 h promis au client (« 13h-15h »). Écrit par l''app à la prise de commande et au changement d''heure. Odoo ne le touche pas.';
