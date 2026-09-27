-- ============================================================
-- La migration 0038 a ajouté p_tier à activate_marabout_subscription() et
-- activate_marabout_subscription_via_payment() via CREATE OR REPLACE —
-- mais Postgres traite une liste d'arguments différente comme une
-- fonction DISTINCTE (surcharge), pas un remplacement. Résultat constaté
-- en live juste après avoir appliqué 0038 : les anciennes signatures
-- (sans p_tier, 30 jours/'standard' en dur) existaient encore à côté des
-- nouvelles. Plus rien ne les appelle (Edge Functions et AdminPage.tsx
-- déployés avec p_tier toujours fourni) — supprimées pour éviter
-- exactement le genre de code mort/désynchronisé déjà rencontré
-- plusieurs fois sur ce projet.
-- ============================================================

DROP FUNCTION IF EXISTS public.activate_marabout_subscription(uuid);
DROP FUNCTION IF EXISTS public.activate_marabout_subscription_via_payment(uuid, text, text);
