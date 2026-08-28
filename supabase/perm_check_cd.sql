-- Permission « Check CD- » : le double contrôle des sorties de congélateur,
-- avec envoi en validation dans Odoo. À lancer AVANT de déployer.
-- Layla attribue ensuite la permission elle-même dans Réglages → Utilisateurs.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_check_cd boolean NOT NULL DEFAULT false;
