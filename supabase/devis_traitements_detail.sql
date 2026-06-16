-- Journal des commandes : colonne « detail » pour décrire chaque action
-- (ex. « Article supprimé : Fraisier », « Date/heure → 2026-06-12 16:00 »).
-- À lancer une fois dans l'éditeur SQL Supabase.
alter table devis_traitements add column if not exists detail text;
