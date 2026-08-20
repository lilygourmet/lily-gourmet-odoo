-- ============================================================
-- ÉCONOMAT — les « badges » (profils) deviennent modifiables depuis l'app
--
-- Avant : la liste des 5 badges était écrite dans le code (src/lib/economat.js).
-- Après : elle vit dans cette table, gérable depuis Économat → Gérer → Badges.
--
-- La colonne `value` garde EXACTEMENT les mêmes codes qu'avant, donc
-- profiles.economat_profil et economat_profil_categories.profil continuent
-- de pointer dessus : personne ne perd son accès.
--
-- À LANCER DANS SUPABASE AVANT LE DÉPLOIEMENT.
-- ============================================================

CREATE TABLE IF NOT EXISTS economat_profils (
  value         TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  display_order INT DEFAULT 0
);

ALTER TABLE economat_profils ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all economat_profils" ON economat_profils FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Les 5 badges existants (mêmes codes que dans l'ancien code)
INSERT INTO economat_profils (value, label, display_order) VALUES
  ('prod_annex',              'Prod Annex',                  10),
  ('prod_finition_cd',        'Prod Finition / CD',          20),
  ('cake_design',             'Cake Design',                 30),
  ('boutique',                'Boutique',                    40),
  ('chocolat_cuisine_menage', 'Chocolat / Cuisine / Ménage', 50)
ON CONFLICT (value) DO NOTHING;

-- Filet de sécurité : si un badge est utilisé quelque part sans être dans la
-- liste (badge ajouté à la main autrefois), on le récupère au lieu de le perdre.
INSERT INTO economat_profils (value, label, display_order)
SELECT DISTINCT p.economat_profil, p.economat_profil, 900
FROM profiles p
WHERE p.economat_profil IS NOT NULL AND p.economat_profil <> ''
ON CONFLICT (value) DO NOTHING;

INSERT INTO economat_profils (value, label, display_order)
SELECT DISTINCT pc.profil, pc.profil, 900
FROM economat_profil_categories pc
WHERE pc.profil IS NOT NULL AND pc.profil <> ''
ON CONFLICT (value) DO NOTHING;
