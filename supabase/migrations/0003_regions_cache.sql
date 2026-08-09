-- Cache partagé des zones OSM calculées (graphe + espaces verts + quartiers),
-- clé par centre arrondi + rayon (voir plan : pas de grille de tuiles
-- indépendantes, même règle d'arrondi que snapToGrid côté client et dans
-- l'Edge Function get-region). Alimenté en lazy-build-on-miss par
-- get-region, jamais écrit directement par le client mobile.
--
-- Contrairement à `progress` (une ligne par utilisateur, RLS scindée par
-- propriétaire), cette table n'a rien de spécifique à un joueur : c'est de
-- la donnée OSM dérivée, partagée et en lecture publique.

create extension if not exists postgis with schema extensions;

create table regions (
  id text primary key, -- ex: "48.858300,2.347000,500" (centre arrondi + rayon)
  center extensions.geography(point, 4326) not null,
  radius int not null,
  payload jsonb not null, -- forme exacte : voir supabase/functions/_shared/serialize.ts
  version text not null default '1', -- une entrée d'une version antérieure à celle
                                     -- de get-region est ignorée et recalculée
  computed_at timestamptz not null default now()
);

create index regions_center_idx on regions using gist (center);

alter table regions enable row level security;

-- Lecture publique (y compris anonyme) : donnée OSM non sensible, partagée
-- entre tous les joueurs.
create policy "regions are readable by everyone"
  on regions for select using (true);

-- Aucune policy insert/update pour anon/authenticated : deny par défaut.
-- L'écriture passe uniquement par get-region, qui utilise la clé service
-- (contourne RLS).
