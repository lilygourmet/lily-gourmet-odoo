-- Permission « Outils IA » : affiche les liens directs vers Gemini et ChatGPT
-- dans le menu, pour le personnel autorisé.
-- À lancer dans Supabase (SQL editor) AVANT de déployer.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_ai_tools BOOLEAN DEFAULT false;
