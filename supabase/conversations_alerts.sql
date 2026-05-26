-- ============================================================
-- LILY GOURMET — Conversations : alertes automatiques (M3)
-- Tourne dans Supabase via pg_cron, toutes les 10 min.
-- Appelle /api/push (chemin user_ids -> exige PUSH_INTERNAL_SECRET).
-- Idempotence : on trace chaque alerte dans conversation_events pour ne pas
-- re-notifier en boucle. Une alerte se redéclenche seulement après un NOUVEAU
-- message client (last_inbound_at avance -> les anciens events deviennent obsolètes).
--
-- ⚠️ AVANT DE LANCER :
--   1. Remplacer 'REMPLACE_PAR_PUSH_INTERNAL_SECRET' ci-dessous par la MÊME
--      valeur que la variable Vercel PUSH_INTERNAL_SECRET.
--   2. Vérifier l'URL prod (v_push_url).
-- pg_net est déjà utilisé par notify_pending_reception, donc déjà activé.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE OR REPLACE FUNCTION check_conversation_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_push_url  text := 'https://lily-gourmet-odoo.vercel.app/api/push?action=send';
  v_secret    text := 'REMPLACE_PAR_PUSH_INTERNAL_SECRET';  -- = variable Vercel
  v_conv      record;
  v_user_ids  uuid[];
  v_admin_ids uuid[];
  v_title     text;
BEGIN
  -- Destinataires (calculés une fois)
  v_user_ids  := ARRAY(SELECT id FROM profiles WHERE perm_conversations = true AND active = true);
  v_admin_ids := ARRAY(SELECT id FROM profiles WHERE role = 'admin' AND active = true);

  -- ===== 30 min : non assignée, sans personne depuis 30 min =====
  FOR v_conv IN
    SELECT c.* FROM conversations c
    WHERE c.status = 'non_assignee'
      AND c.last_inbound_at IS NOT NULL
      AND c.last_inbound_at <= now() - interval '30 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM conversation_events e
        WHERE e.conversation_id = c.id AND e.type = 'alert_30min'
          AND e.created_at > c.last_inbound_at
      )
  LOOP
    CONTINUE WHEN array_length(v_user_ids, 1) IS NULL;
    v_title := COALESCE(v_conv.client_name, v_conv.client_phone);
    PERFORM net.http_post(
      url     := v_push_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
      body    := jsonb_build_object(
        'userIds', to_jsonb(v_user_ids),
        'title',   '⏰ Message en attente',
        'body',    v_title || ' attend depuis 30 min',
        'url',     '/?conv=' || v_conv.id,
        'tag',     'conv-alert-' || v_conv.id
      )
    );
    INSERT INTO conversation_events (conversation_id, type, payload)
      VALUES (v_conv.id, 'alert_30min', jsonb_build_object('level', '30min'));
  END LOOP;

  -- ===== 2h : en cours, dernier message client sans réponse agent depuis 2h =====
  FOR v_conv IN
    SELECT c.* FROM conversations c
    WHERE c.status = 'en_cours'
      AND c.last_inbound_at IS NOT NULL
      AND c.last_inbound_at <= now() - interval '2 hours'
      AND NOT EXISTS (
        SELECT 1 FROM messages m
        WHERE m.conversation_id = c.id AND m.sender_type = 'agent'
          AND m.sent_at > c.last_inbound_at
      )
      AND NOT EXISTS (
        SELECT 1 FROM conversation_events e
        WHERE e.conversation_id = c.id AND e.type = 'alert_2h'
          AND e.created_at > c.last_inbound_at
      )
  LOOP
    CONTINUE WHEN array_length(v_admin_ids, 1) IS NULL;
    v_title := COALESCE(v_conv.client_name, v_conv.client_phone);
    PERFORM net.http_post(
      url     := v_push_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
      body    := jsonb_build_object(
        'userIds', to_jsonb(v_admin_ids),
        'title',   '🔔 Client sans réponse (2h)',
        'body',    v_title || ' attend une réponse depuis 2h',
        'url',     '/?conv=' || v_conv.id,
        'tag',     'conv-alert-' || v_conv.id
      )
    );
    INSERT INTO conversation_events (conversation_id, type, payload)
      VALUES (v_conv.id, 'alert_2h', jsonb_build_object('level', '2h'));
  END LOOP;

  -- ===== 3 jours : en cours, silence > 3j =====
  FOR v_conv IN
    SELECT c.* FROM conversations c
    WHERE c.status = 'en_cours'
      AND c.last_inbound_at IS NOT NULL
      AND c.last_inbound_at <= now() - interval '3 days'
      AND NOT EXISTS (
        SELECT 1 FROM conversation_events e
        WHERE e.conversation_id = c.id AND e.type = 'silence_3j'
          AND e.created_at > c.last_inbound_at
      )
  LOOP
    v_title := COALESCE(v_conv.client_name, v_conv.client_phone);
    -- Ligne d'audit (demandée explicitement)
    INSERT INTO conversation_events (conversation_id, type, payload)
      VALUES (v_conv.id, 'silence_3j', jsonb_build_object('level', '3j'));
    -- Push au commercial assigné (si présent)
    IF v_conv.assigned_to IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_push_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
        body    := jsonb_build_object(
          'userIds', to_jsonb(ARRAY[v_conv.assigned_to]),
          'title',   '😴 Conversation en silence (3j)',
          'body',    v_title || ' : aucune nouvelle depuis 3 jours',
          'url',     '/?conv=' || v_conv.id,
          'tag',     'conv-alert-' || v_conv.id
        )
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- Planification : toutes les 10 minutes (idempotent)
-- ============================================================
DO $$ BEGIN
  PERFORM cron.unschedule('conversation-alerts');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'conversation-alerts',
  '*/10 * * * *',
  $$ SELECT check_conversation_alerts(); $$
);

-- ============================================================
-- POUR TESTER (facultatif) :
--   -- déclencher tout de suite :        SELECT check_conversation_alerts();
--   -- voir les exécutions du cron :     SELECT * FROM cron.job_run_details
--                                          WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='conversation-alerts')
--                                          ORDER BY start_time DESC LIMIT 10;
--   -- baisser temporairement un seuil : remplacer 'interval ''30 minutes''' par 'interval ''1 minute'''
-- POUR ARRÊTER :  SELECT cron.unschedule('conversation-alerts');
-- ============================================================
