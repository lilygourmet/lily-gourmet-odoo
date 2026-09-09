-- ============================================================
-- « Fabrication Annexe 2 » : rendre le catalogue lisible et modifiable
-- depuis l'app, pour l'écran « Mini / maxi Annexe ».
--
-- La table n'était ouverte qu'au rôle `authenticated`. Or l'app a sa propre
-- connexion (auth maison) et parle à Supabase avec la clé `anon` : la lecture
-- ne renvoyait RIEN — pas une erreur, zéro ligne. L'écran affichait donc
-- « 0 article suivi » sans rien dire.
--
-- Même ouverture que `cd_minmax`, qui sert le même genre d'écran.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

DROP POLICY IF EXISTS fab_annexe_articles_all ON fab_annexe_articles;
CREATE POLICY fab_annexe_articles_all ON fab_annexe_articles
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
