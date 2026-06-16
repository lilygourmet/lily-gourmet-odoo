-- Mémorise le statut « client fidèle » (≥5 commandes Cake Design sans acompte).
-- Une fois acquis, il reste : plus besoin d'interroger Odoo à chaque rafraîchissement.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS fidele BOOLEAN DEFAULT false;
NOTIFY pgrst, 'reload schema';
