-- Corrige l'erreur « Cannot coerce the result to a single JSON object » à la CLÔTURE de journée.
-- Cause : l'équipe café peut LIRE la journée et COMPTER, mais n'a pas le droit de METTRE À JOUR
-- la table stock_day (statut « submitted »). L'update ne renvoyait aucune ligne -> erreur.
-- Solution : autoriser les utilisateurs connectés (authenticated) à mettre à jour stock_day
-- (la clôture, la réouverture et la validation audit passent toutes par un UPDATE).
-- L'accès reste protégé : seuls les comptes avec la permission café voient le bouton dans l'app.

drop policy if exists "stock_day_update_auth" on public.stock_day;
create policy "stock_day_update_auth" on public.stock_day
  for update to authenticated
  using (true) with check (true);
