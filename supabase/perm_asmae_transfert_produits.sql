-- Activer « Transferts Produits (SM) » pour Asmaa (compte « asmae »).
-- Elle a déjà l'atelier Prod boutique : elle pourra envoyer vers l'annexe
-- et confirmer ce qui arrive à la boutique, pour les produits SM.
UPDATE profiles SET perm_transfert_produits = true WHERE username = 'asmae';
