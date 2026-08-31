-- Deux imprimantes dans la boutique : l'Epson (tickets) et la G&G GG-D410 (étiquettes).
-- Chaque travail dit sur laquelle il doit sortir ; le PC route selon cette colonne.
-- Les tickets existants gardent 'ticket' : rien ne change pour eux.
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS printer TEXT NOT NULL DEFAULT 'ticket';
