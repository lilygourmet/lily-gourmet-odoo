-- ============================================================
-- Suppression DÉFINITIVE d'un compte utilisateur (table profiles).
-- Réservée aux ADMINS, et UNIQUEMENT pour un compte DÉJÀ DÉSACTIVÉ (active = false).
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire → contourne la RLS
-- (il n'existe pas de règle DELETE sur profiles côté app, d'où le blocage actuel).
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================
CREATE OR REPLACE FUNCTION hard_delete_user(p_user_id uuid, p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) Seul un admin actif peut supprimer.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND role = 'admin' AND active = true) THEN
    RAISE EXCEPTION 'Action réservée aux administrateurs.';
  END IF;
  -- 2) Sécurité : on ne supprime QUE les comptes déjà désactivés.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND active = false) THEN
    RAISE EXCEPTION 'Le compte doit d''abord être désactivé avant suppression.';
  END IF;
  -- 3) Suppression (échoue proprement si des données en RESTRICT y sont encore liées).
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION hard_delete_user(uuid, uuid) TO anon, authenticated;
