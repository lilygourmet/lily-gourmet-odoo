-- ============================================================
-- Lien user (profiles) ↔ employé (employes).
-- Permet d'avoir un seul numéro de téléphone (saisi sur l'employé)
-- et de l'utiliser comme WhatsApp pour les notifs côté user.
--
-- À exécuter AVANT le déploiement du code qui lit cette colonne.
-- ============================================================

-- 1) Ajout de la colonne et de son index
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS employe_id BIGINT REFERENCES employes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_employe_id_idx ON profiles(employe_id);

-- 2) Auto-lien des users existants par nom complet (insensible à la casse
-- et aux espaces de bord). On ne lie QUE quand il y a UN SEUL employé qui
-- correspond, pour éviter les faux positifs (ex: 2 employés "Souad").
UPDATE profiles p
SET employe_id = e.id
FROM employes e
WHERE p.employe_id IS NULL
  AND LOWER(TRIM(p.full_name)) = LOWER(TRIM(e.nom))
  AND (
    SELECT COUNT(*) FROM employes e2
    WHERE LOWER(TRIM(e2.nom)) = LOWER(TRIM(p.full_name))
  ) = 1;

-- 3) Pour info, liste les users non liés (à relier à la main dans l'UI)
-- (Lance cette requête seule pour voir le résultat ; elle ne modifie rien)
-- SELECT id, username, full_name FROM profiles WHERE employe_id IS NULL;
