-- Alerte « réception à vérifier » (Checklist → numéro qui valide les transferts)
-- ---------------------------------------------------------------------------
-- Quand la boutique confirme un GS- salé dans la Checklist, l'app prévient par
-- WhatsApp le numéro réglé dans l'onglet Transferts. Les confirmations sont
-- regroupées (10 min) : cette colonne retient ce qui est déjà parti, pour ne
-- jamais annoncer deux fois le même article.

alter table stock_day_items
  add column if not exists transfert_alerte_at timestamptz;

-- Tout ce qui est DÉJÀ confirmé aujourd'hui est considéré comme annoncé :
-- sinon le premier passage enverrait un message avec toute la journée.
update stock_day_items
   set transfert_alerte_at = now()
 where reception_status = 'confirmed'
   and transfert_alerte_at is null;
