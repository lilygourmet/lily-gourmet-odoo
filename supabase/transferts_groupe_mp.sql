-- Pectine NH et Pecan (ajoutés après l'analyse) : les ranger avec les matières
-- premières au lieu de « Autres ». Facultatif — confort d'affichage seulement.
UPDATE transferts_articles SET groupe = 'matiere' WHERE famille = 'mp';
