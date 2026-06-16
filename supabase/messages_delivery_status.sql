-- Statut de réception WhatsApp d'un message sortant : 'sent', 'delivered', 'read', 'failed'.
-- Renseigné par les accusés de réception envoyés par Wati au webhook.
-- Sert à afficher une coche (✓ envoyé / ✓✓ reçu / lu / ⚠ non reçu), utile surtout pour les audios.
alter table messages add column if not exists delivery_status text;
