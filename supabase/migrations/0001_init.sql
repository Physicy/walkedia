-- Walkedia : comptes, synchronisation de la progression, classement, amis.
--
-- La progression (edges/junctions/completedAt) est stockée telle quelle
-- (jsonb) pour rester compatible avec la forme utilisée en local
-- (mobile/src/logic/storage.ts) : pas de reconstruction de schéma côté
-- app, juste un upsert de la même structure. `junction_count` est une
-- colonne générée pour trier le classement sans décompresser le jsonb à
-- chaque requête.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  edges jsonb not null default '[]'::jsonb,
  junctions jsonb not null default '[]'::jsonb,
  completed_at jsonb not null default '{}'::jsonb,
  edge_meters numeric not null default 0,
  junction_count int generated always as (jsonb_array_length(junctions)) stored,
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  edges_count int not null default 0,
  junctions_count int not null default 0,
  imported boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, started_at, ended_at)
);

create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

-- ------------------------------------------------------------ profil auto
-- Crée la ligne `profiles` (et `progress` vide) dès l'inscription, pour ne
-- jamais avoir à gérer leur absence côté app.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  insert into public.progress (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------------- RLS
alter table profiles enable row level security;
alter table progress enable row level security;
alter table sessions enable row level security;
alter table friendships enable row level security;

-- profils : lisibles par tout utilisateur connecté (recherche d'amis,
-- affichage des noms sur le classement), modifiables par leur propriétaire.
create policy "profiles are readable by authenticated users"
  on profiles for select to authenticated using (true);
create policy "profiles are editable by their owner"
  on profiles for update to authenticated using (auth.uid() = id);

-- progress : le détail précis (tronçons/carrefours) reste privé — lisible
-- par le propriétaire et ses amis acceptés (comparaison de progression),
-- jamais par un inconnu. Le classement public passe par la vue
-- `leaderboard` ci-dessous, qui n'expose que le total.
create policy "progress is readable by owner or accepted friends"
  on progress for select to authenticated using (
    auth.uid() = user_id
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = user_id))
    )
  );
create policy "progress is writable by its owner"
  on progress for update to authenticated using (auth.uid() = user_id);
create policy "progress is insertable by its owner"
  on progress for insert to authenticated with check (auth.uid() = user_id);

create policy "sessions are readable by their owner"
  on sessions for select to authenticated using (auth.uid() = user_id);
create policy "sessions are insertable by their owner"
  on sessions for insert to authenticated with check (auth.uid() = user_id);

-- friendships : les deux participants voient la relation ; seul le
-- demandeur peut créer une demande, seul le destinataire peut la faire
-- passer à "accepted" (via la fonction RPC ci-dessous plutôt qu'un UPDATE
-- direct, pour garder cette règle à un seul endroit).
create policy "friendships are readable by participants"
  on friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendship requests are created by the requester"
  on friendships for insert to authenticated
  with check (auth.uid() = requester_id);

create function public.respond_to_friend_request(request_id uuid, accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update friendships
  set status = case when accept then 'accepted' else 'blocked' end,
      responded_at = now()
  where id = request_id
    and addressee_id = auth.uid()
    and status = 'pending';
end;
$$;

-- ------------------------------------------------------------ classement
-- N'expose que ce qui est nécessaire à un classement public : pas les
-- tronçons/carrefours précis (voir policy `progress` ci-dessus).
create view leaderboard as
  select p.user_id, pr.display_name, p.junction_count, p.edge_meters
  from progress p
  join profiles pr on pr.id = p.user_id
  order by p.junction_count desc;

grant select on leaderboard to authenticated;
