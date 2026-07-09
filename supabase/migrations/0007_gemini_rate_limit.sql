-- ============================================================
-- Secret Divin — Rate limit serveur sur l'appel Gemini
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Un compteur en mémoire côté client (proposé initialement) est
-- contournable trivialement en appelant l'Edge Function directement, sans
-- passer par l'app. Un compteur en mémoire DANS l'Edge Function ne serait
-- pas fiable non plus (les isolates Deno redémarrent à froid et ne
-- partagent pas d'état entre invocations/régions). Cette table + fonction
-- vivent dans la base : c'est la seule limite qu'un client ne peut pas
-- contourner.
-- ============================================================

CREATE TABLE IF NOT EXISTS gemini_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamp NOT NULL DEFAULT now(),
  call_count integer NOT NULL DEFAULT 0
);

ALTER TABLE gemini_rate_limits ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seule check_gemini_rate_limit() (SECURITY DEFINER) peut
-- lire/écrire cette table.

CREATE OR REPLACE FUNCTION check_gemini_rate_limit(p_max_calls integer DEFAULT 20, p_window_seconds integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_window_start timestamp;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT window_start, call_count INTO v_window_start, v_count
  FROM gemini_rate_limits WHERE user_id = v_user_id FOR UPDATE;

  IF v_window_start IS NULL OR now() - v_window_start > (p_window_seconds || ' seconds')::interval THEN
    INSERT INTO gemini_rate_limits (user_id, window_start, call_count)
      VALUES (v_user_id, now(), 1)
      ON CONFLICT (user_id) DO UPDATE SET window_start = now(), call_count = 1;
    RETURN true;
  END IF;

  IF v_count >= p_max_calls THEN
    RETURN false;
  END IF;

  UPDATE gemini_rate_limits SET call_count = call_count + 1 WHERE user_id = v_user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION check_gemini_rate_limit(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION check_gemini_rate_limit(integer, integer) TO authenticated;
