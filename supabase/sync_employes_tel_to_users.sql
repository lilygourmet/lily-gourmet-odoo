-- ============================================================
-- Propage le téléphone (employes.telephone) → profiles.whatsapp
-- pour tous les profiles avec un employe_id lié.
-- Normalise au format WATI international : 212XXXXXXXXX.
--   "06 66 32 84 93" → "212666328493"
--   "+212 6 12 34 56 78" → "212612345678"
--   "212666328493"       → "212666328493"
-- À lancer une fois après que les téléphones employés ont été saisis.
-- Idempotent : peut être relancé.
-- ============================================================

UPDATE profiles p
SET whatsapp =
  CASE
    WHEN regexp_replace(e.telephone, '\D', '', 'g') LIKE '212%'
      THEN regexp_replace(e.telephone, '\D', '', 'g')
    WHEN regexp_replace(e.telephone, '\D', '', 'g') LIKE '0%'
      THEN '212' || substring(regexp_replace(e.telephone, '\D', '', 'g') from 2)
    ELSE regexp_replace(e.telephone, '\D', '', 'g')
  END
FROM employes e
WHERE p.employe_id = e.id
  AND e.telephone IS NOT NULL
  AND btrim(e.telephone) <> '';
