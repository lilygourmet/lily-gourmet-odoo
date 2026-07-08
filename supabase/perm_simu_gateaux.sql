-- Permission « Simulation gâteaux » (onglet de simulation visuelle des gâteaux
-- par nombre de personnes et d'étages).
-- À lancer dans Supabase (SQL editor) AVANT de déployer.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_simu_gateaux boolean NOT NULL DEFAULT false;
