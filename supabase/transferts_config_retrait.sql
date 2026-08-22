-- ============================================================
-- LILY GOURMET — La table des numéros WhatsApp des transferts ne sert plus
--
-- Les alertes partent désormais vers les personnes de l'atelier qui réceptionne,
-- sur le numéro de leur fiche employé (comme l'économat). Plus de numéro à tenir
-- à jour, donc plus besoin de cette table.
-- Facultatif : l'app fonctionne déjà sans. À exécuter dans Supabase si tu veux
-- faire le ménage.
-- ============================================================

DROP TABLE IF EXISTS transferts_config;
DELETE FROM app_config WHERE key LIKE 'transfert_wa_%';
