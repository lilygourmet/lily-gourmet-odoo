-- ============================================================
-- LA BARRE LATÉRALE SUR TABLETTE, POUR CELLES QUI LA DEMANDENT.
--
-- « Zineb et Hanane sont sur tablette. Elles veulent leurs onglets en fixe /
--   auto ou Rail, pas avec la barre en bas de l'écran. Peux-tu le faire que
--   pour les deux ? » (Layla, 2026-09-23)
--
-- La barre latérale n'apparaissait qu'à partir de 1024 px — donc sur ordinateur
-- seulement. Une tablette en portrait fait 768 px : elles n'avaient jamais que
-- la barre du bas. Ce réglage descend le seuil à 700 px POUR ELLES SEULES.
--
-- Ce n'est PAS une permission : ça n'ouvre aucun écran, ça ne fait que changer
-- où sont leurs onglets. Personne d'autre ne voit son écran changer.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nav_lateral BOOLEAN NOT NULL DEFAULT false;

-- Les deux commerciales, et elles seules.
UPDATE public.profiles SET nav_lateral = true
WHERE username IN ('zineb', 'hanane');

-- Vérification : qui l'a.
SELECT username, full_name, nav_lateral
FROM public.profiles
WHERE nav_lateral
ORDER BY username;
