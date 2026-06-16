-- Réponse préparée automatiquement à la réception d'un message client (brouillon IA).
-- Pré-remplie dans la zone d'écriture à l'ouverture de la conversation. JAMAIS envoyée seule.
-- Effacée dès que le commercial répond (handleSend) ou écrasée au message client suivant.
alter table conversations add column if not exists suggested_reply text;
