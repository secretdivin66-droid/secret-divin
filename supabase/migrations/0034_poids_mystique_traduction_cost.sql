-- ============================================================
-- Secret Divin — coût de la translittération FR->arabe sur
-- /poids-mystique (texte non-arabe détecté, >200 caractères).
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Le texte arabe direct reste gratuit (tool_costs.poids-mystique = 0,
-- inchangé). Ce nouveau tool_id est utilisé uniquement par spend_credits()
-- côté PoidsMystiquePage.tsx quand le texte saisi n'est pas de l'arabe et
-- dépasse 200 caractères — voir ce fichier pour la règle complète
-- (≤200 caractères : gratuit mais accès conditionné à 2 crédits ou un
-- abonnement actif ; >200 : 2 crédits déduits, sauf abonnement illimité).
-- ============================================================

INSERT INTO tool_costs (tool, cost) VALUES ('poids-mystique-traduction', 2)
ON CONFLICT (tool) DO UPDATE SET cost = EXCLUDED.cost;
