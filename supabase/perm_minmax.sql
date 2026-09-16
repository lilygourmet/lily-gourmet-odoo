-- Permissions « Mini / maxi CD » et « Mini / maxi Annexe ».
-- Ces deux écrans étaient réservés aux admins : changer un mini change ce que
-- l'atelier fabriquera demain. Layla veut pouvoir les ouvrir à d'autres
-- (2026-09-16) — d'où DEUX permissions séparées, à false par défaut.
-- À lancer AVANT de déployer. Layla attribue ensuite chaque permission
-- elle-même dans Réglages → Utilisateurs.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_minmax_cd boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_minmax_annexe boolean NOT NULL DEFAULT false;
