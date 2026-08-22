-- ============================================================
-- LILY GOURMET — Séparer « envoyer » et « réceptionner » les transferts
--
-- Jusqu'ici, avoir un atelier donnait les deux droits. On les sépare :
--   • atelier  (Prod annexe / Prod boutique) → D'OÙ la personne envoie, et ce qui lui arrive
--   • envoyer      → elle peut enregistrer un envoi
--   • réceptionner → elle peut confirmer les quantités reçues (c'est ce qui crée le
--                    transfert dans Odoo)
--
-- Pour ne rien casser, toute personne qui a déjà un atelier reçoit les DEUX droits :
-- rien ne change pour elle, et tu retires ensuite celui que tu ne veux pas lui laisser.
-- À exécuter dans Supabase (SQL editor) AVANT de déployer. Relançable sans risque.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_transfert_envoi     boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_transfert_reception boolean NOT NULL DEFAULT false;

UPDATE profiles
   SET perm_transfert_envoi = true, perm_transfert_reception = true
 WHERE perm_transfert_annexe = true OR perm_transfert_boutique = true;
