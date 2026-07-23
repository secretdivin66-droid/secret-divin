-- ============================================================
-- Secret Divin — Colonne FAQ structurée pour blog_articles
-- Migration ADDITIVE et IDEMPOTENTE.
--
-- BlogArticlePage.tsx affichait `content` en texte brut (whitespace-
-- pre-line), donc aucun schema FAQPage n'était jamais réellement
-- exploitable : injecter du JSON-LD à l'intérieur d'une chaîne texte
-- échappée par React ne produit ni lien cliquable ni <script> réel
-- dans le DOM. Cette colonne sépare la FAQ (question/réponse) du
-- corps de l'article, pour générer un vrai <script type=
-- "application/ld+json"> dans le composant plutôt que de la deviner
-- en parsant du HTML libre.
--
-- Format attendu : [{ "question": "...", "answer": "..." }, ...]
-- NULL = pas de FAQ pour cet article (cas normal, pas obligatoire).
-- ============================================================

ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS faq jsonb;
