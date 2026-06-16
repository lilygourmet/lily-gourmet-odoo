-- Badge « 🎂 Commande » : marque une conversation quand le client a passé
-- commande via le lien public. Effacé quand on ouvre la conversation.
alter table conversations add column if not exists link_order_at  timestamptz;
alter table conversations add column if not exists link_order_ref  text;
