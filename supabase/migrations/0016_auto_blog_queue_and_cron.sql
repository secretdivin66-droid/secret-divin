-- ============================================================
-- Secret Divin — File thématique pour auto-blog + planification pg_cron
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur
-- (create table/schema if not exists, ON CONFLICT DO NOTHING sur le seed,
-- cron.schedule met à jour les jobs existants plutôt que d'en dupliquer).
--
-- === Secret partagé pour l'authentification du cron (pas de Vault) ===
-- pg_cron/pg_net tournent côté base de données et ont besoin d'un secret
-- à placer dans l'en-tête Authorization de chaque appel à auto-blog —
-- Supabase Vault (dashboard) est souvent indisponible sur le plan
-- gratuit, et `alter database ... set` renvoie "permission denied" (même
-- constat déjà rencontré sur un autre projet). À la place : une table
-- dédiée dans un schéma `private`, jamais exposé par l'API REST Supabase
-- (qui ne sert que les schémas listés dans Project Settings → API,
-- `public` par défaut) et sans aucun grant vers anon/authenticated —
-- seul le rôle postgres (donc pg_cron, qui tourne avec ce rôle) peut la
-- lire.
--
-- Le secret n'est PAS la clé service_role (accès total, RLS bypass
-- compris) mais un secret dédié à ce seul usage, AUTO_BLOG_CRON_SECRET,
-- généré aléatoirement (ex: openssl rand -hex 32), à renseigner UNE
-- FOIS, hors migration, dans le SQL Editor ou via la CLI :
--
--   insert into private.pipeline_secrets (name, value)
--   values ('auto_blog_cron_secret', 'UN_SECRET_ALEATOIRE_LONG')
--   on conflict (name) do update set value = excluded.value;
--
-- Cette même valeur doit aussi être ajoutée comme secret d'Edge Function
-- (supabase secrets set AUTO_BLOG_CRON_SECRET=...) : auto-blog la lit
-- via Deno.env.get('AUTO_BLOG_CRON_SECRET') pour valider l'en-tête
-- x-auto-blog-cron-secret de chaque appel — la fonction doit aussi être
-- déployée avec --no-verify-jwt (pg_cron n'envoie pas de JWT Supabase).
-- ============================================================

create schema if not exists private;

create table if not exists private.pipeline_secrets (
  name text primary key,
  value text not null
);

revoke all on private.pipeline_secrets from anon, authenticated;

-- === File thématique (blog_queue) ===
-- Une ligne = un angle précis à traiter. status='pending' : pas encore
-- généré ; 'done' : déjà transformé en article (article_id renseigné).
-- Quand plus aucune ligne n'est 'pending', auto-blog pioche un thème déjà
-- 'done' au hasard et demande à Gemini un NOUVEL angle dessus (jamais un
-- doublon littéral, voir le prompt dans la fonction) — la file ne se vide
-- donc jamais vraiment, elle grossit indéfiniment avec de nouveaux angles.
create table if not exists blog_queue (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  topic text not null,
  category text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  article_id uuid references blog_articles(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (theme, topic)
);

create index if not exists idx_blog_queue_status on blog_queue(status);

alter table blog_queue enable row level security;

-- Même politique que blog_articles (migration 0004) : lecture/écriture
-- réservée aux admins pour une éventuelle UI de suivi future — auto-blog
-- lit/écrit via service_role, qui contourne RLS de toute façon.
drop policy if exists "admin_manage_blog_queue" on blog_queue;
create policy "admin_manage_blog_queue" on blog_queue
  for all using (
    exists (select 1 from user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  )
  with check (
    exists (select 1 from user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

-- Seed : les 65 angles de référence fournis par l'utilisateur, groupés
-- par thème. `category` reprend directement une valeur de
-- src/utils/blog.ts::BLOG_CATEGORIES (voir ce fichier pour le détail des
-- 7 thèmes réutilisés tels quels ou mappés, et les 6 nouveaux ajoutés).
insert into blog_queue (theme, topic, category) values
  ('Secrets Mystiques', 'Secret d''Ayat al-Kursi pour la protection', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret de la sourate Al-Waqi''a pour le rizq', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret islamique pour faciliter le mariage', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret pour réconcilier un couple', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret coranique contre le mauvais oeil', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret du Nom Al-Fattah pour l''ouverture', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret pour débloquer son commerce', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret de la ruqya coranique', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret de Salat al-Istikhara', 'Secrets Mystiques'),
  ('Secrets Mystiques', 'Secret des 99 Noms d''Allah', 'Secrets Mystiques'),

  ('Poids Mystique', 'Comment calculer son poids mystique Abjad', 'Poids mystique'),
  ('Poids Mystique', 'Secret des valeurs Abjad et leur signification', 'Poids mystique'),
  ('Poids Mystique', 'Les 4 éléments du poids mystique', 'Poids mystique'),
  ('Poids Mystique', 'Poids mystique et personnalité', 'Poids mystique'),
  ('Poids Mystique', 'Secret du calcul Abjad des Noms divins', 'Poids mystique'),

  ('Carrés Magiques', 'Secret des carrés numériques islamiques', 'Carrés magiques'),
  ('Carrés Magiques', 'Le carré magique 3x3 de Saturne', 'Carrés magiques'),
  ('Carrés Magiques', 'Les 7 carrés magiques et leurs planètes', 'Carrés magiques'),
  ('Carrés Magiques', 'Secret des awfaq dans la tradition islamique', 'Carrés magiques'),
  ('Carrés Magiques', 'Utiliser un carré magique pour la protection', 'Carrés magiques'),

  ('Rêves', 'Les 3 types de rêves en Islam', 'Rêves'),
  ('Rêves', '10 symboles de rêves fréquents en Islam', 'Rêves'),
  ('Rêves', 'Comment interpréter un rêve selon la Sunna', 'Rêves'),
  ('Rêves', 'Rêves prémonitoires en Islam', 'Rêves'),
  ('Rêves', 'Ce que dit le Coran sur les rêves', 'Rêves'),

  ('Plantes Mystiques', 'Plantes sacrées d''Afrique de l''Ouest', 'Plantes mystiques'),
  ('Plantes Mystiques', 'Plantes mystiques pour la protection', 'Plantes mystiques'),
  ('Plantes Mystiques', 'Plantes islamiques pour le rizq', 'Plantes mystiques'),
  ('Plantes Mystiques', 'Préparer un rituel de plantes', 'Plantes mystiques'),
  ('Plantes Mystiques', '7 plantes puissantes de la médecine africaine', 'Plantes mystiques'),

  ('Géomancie', '16 figures géomantiques africaines', 'Géomancie africaine'),
  ('Géomancie', 'Pratiquer le Khatt ar-Raml', 'Géomancie africaine'),
  ('Géomancie', 'Géomancie islamique origines et méthode', 'Géomancie africaine'),
  ('Géomancie', 'Lire un thème géomantique complet', 'Géomancie africaine'),
  ('Géomancie', 'Géomancie africaine vs occidentale', 'Géomancie africaine'),

  ('Destin', '17 points mystiques pour la destinée', 'Destin'),
  ('Destin', 'Connaître sa vocation selon l''Islam', 'Destin'),
  ('Destin', 'Étoile dominante et date de naissance', 'Destin'),
  ('Destin', 'Destin et poids mystique combinés', 'Destin'),
  ('Destin', 'Lecture complète de la destinée', 'Destin'),

  ('Jours de Naissance', 'Chaque jour et sa planète en Islam', 'Jours de Naissance'),
  ('Jours de Naissance', 'Jour de naissance et personnalité', 'Jours de Naissance'),
  ('Jours de Naissance', 'Jours favorables en astrologie islamique', 'Jours de Naissance'),
  ('Jours de Naissance', 'Jour de naissance et poids mystique', 'Jours de Naissance'),
  ('Jours de Naissance', 'Secret spirituel de chaque jour', 'Jours de Naissance'),

  ('Compatibilité', 'Compatibilité selon le poids mystique', 'Compatibilité'),
  ('Compatibilité', 'Les 4 éléments et la compatibilité', 'Compatibilité'),
  ('Compatibilité', 'Calculer la compatibilité mystique', 'Compatibilité'),
  ('Compatibilité', 'Compatibilité pour le mariage en Islam', 'Compatibilité'),
  ('Compatibilité', 'Éléments incompatibles en Islam', 'Compatibilité'),

  ('Formation', 'Introduction aux sciences ésotériques', 'Formation'),
  ('Formation', 'Apprendre l''Ilm al-Huruf', 'Formation'),
  ('Formation', '6 modules de formation Secret Divin', 'Formation'),
  ('Formation', 'Maîtriser la table Abjad', 'Formation'),
  ('Formation', 'Sciences islamiques par où commencer', 'Formation'),

  ('Attraper ou Réconcilier', 'Réconcilier deux personnes en Islam', 'Attraper ou Réconcilier'),
  ('Attraper ou Réconcilier', 'Secret du Nom Al-Wadud', 'Attraper ou Réconcilier'),
  ('Attraper ou Réconcilier', 'Talisman de réconciliation islamique', 'Attraper ou Réconcilier'),
  ('Attraper ou Réconcilier', 'Rétablir une relation brisée', 'Attraper ou Réconcilier'),
  ('Attraper ou Réconcilier', 'Secret coranique pour la paix', 'Attraper ou Réconcilier'),

  ('Tutoriels', 'Tutoriel Poids Mystique pas à pas', 'Tutoriels'),
  ('Tutoriels', 'Créer son premier carré magique', 'Tutoriels'),
  ('Tutoriels', 'Comprendre la géomancie islamique', 'Tutoriels'),
  ('Tutoriels', 'Interpréter ses rêves avec Secret Divin', 'Tutoriels'),
  ('Tutoriels', 'Toutes les fonctionnalités de Secret Divin', 'Tutoriels')
on conflict (theme, topic) do nothing;

-- === Planning pg_cron : 2 articles/jour, 7j/7, sans exception ===
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'auto-blog-morning',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://rldkftitqtipmvtyiqqa.supabase.co/functions/v1/auto-blog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-auto-blog-cron-secret', (
        select value from private.pipeline_secrets where name = 'auto_blog_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'auto-blog-evening',
  '0 18 * * *',
  $$
  select net.http_post(
    url := 'https://rldkftitqtipmvtyiqqa.supabase.co/functions/v1/auto-blog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-auto-blog-cron-secret', (
        select value from private.pipeline_secrets where name = 'auto_blog_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
