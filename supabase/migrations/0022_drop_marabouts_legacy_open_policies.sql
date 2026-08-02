-- ============================================================
-- Secret Divin — Supprime 3 policies RLS héritées sur marabouts
-- qui court-circuitaient les policies restrictives de 0006_marabouts.sql
-- Migration ADDITIVE et IDEMPOTENTE (DROP POLICY IF EXISTS).
--
-- Contexte (découvert le 2026-08-03, même dérive schéma-vs-réalité que
-- 0020/0021) : trois policies au nommage dashboard (mélange
-- anglais/français, sans le préfixe convention user_/admin_/owner_/
-- public_) existaient déjà en prod avant que 0006 ajoute ses policies
-- restrictives. Les policies RLS PERMISSIVE se combinent en OR : ces
-- policies héritées rendaient donc les restrictions de 0006 inopérantes.
--
-- 1. "Autoriser les insertions" (rôle anon, WITH CHECK true) : n'importe
--    quel visiteur NON connecté pouvait insérer une ligne marabouts
--    arbitraire — user_id de son choix, is_verified=true,
--    abonnement_actif=true.
-- 2. "Authenticated users can insert their own marabout profile" (rôle
--    authenticated, WITH CHECK auth.uid()=user_id sans restriction sur
--    is_verified/abonnement_actif) : tout utilisateur connecté pouvait se
--    créer un profil marabout déjà vérifié et abonné, contournant
--    entièrement verify_marabout()/activate_marabout_subscription()
--    (admin-only, voir AdminPage.tsx) et le paiement WhatsApp manuel.
-- 3. "Everyone can view active verified marabouts" (rôle public, USING
--    true) : fuite de PII — tous les profils marabouts (y compris non
--    vérifiés/inactifs) étaient lisibles par n'importe qui, dont
--    numero_whatsapp et nom_complet.
--
-- Les policies légitimes de 0006 (user_register_as_marabout,
-- public_read_marabouts, owner_read_own_marabout, admin_read_all_marabouts,
-- owner_update_own_marabout, admin_delete_marabouts) couvrent déjà tous
-- les accès nécessaires — confirmé : le chemin UPDATE self-service est
-- protégé séparément par des GRANT UPDATE colonne-par-colonne (schema.sql)
-- qui excluent is_verified/abonnement_actif/is_active, donc aucune policy
-- de remplacement n'est nécessaire ici.
-- ============================================================

drop policy if exists "Autoriser les insertions" on marabouts;
drop policy if exists "Authenticated users can insert their own marabout profile" on marabouts;
drop policy if exists "Everyone can view active verified marabouts" on marabouts;
