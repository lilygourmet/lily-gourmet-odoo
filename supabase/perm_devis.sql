-- Permission "Voir les Devis" (onglet Devis : relance des devis non confirmés)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_devis BOOLEAN DEFAULT false;
