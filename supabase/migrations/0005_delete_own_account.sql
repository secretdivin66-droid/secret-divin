-- ============================================================
-- Secret Divin — Suppression de compte complète et réelle
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Le flux "supprimer mon compte" initialement prévu supprimait les
-- lignes une par une dans profiles/saved_rituals/user_credits/etc.
-- depuis le client, mais ne supprimait jamais la ligne auth.users
-- elle-même : le compte restait donc utilisable pour se reconnecter,
-- juste avec toutes ses données effacées. En plus, 4 des 8 tables
-- visées (user_credits, subscriptions, credit_transactions, user_roles)
-- n'acceptent plus les écritures directes du client depuis les
-- migrations de sécurité précédentes de cette session — la boucle de
-- suppression y échouerait silencieusement (RLS bloque, 0 ligne
-- affectée, pas d'erreur levée), laissant des données orphelines après
-- une demande de suppression de compte.
--
-- Comme toutes ces tables référencent déjà auth.users(id)
-- ON DELETE CASCADE, une seule suppression de la ligne auth.users
-- nettoie tout automatiquement ET supprime réellement le compte.
-- ============================================================

CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION delete_own_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
