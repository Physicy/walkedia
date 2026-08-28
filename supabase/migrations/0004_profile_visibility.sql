-- Confidentialité (Réglages > Masquer mes statistiques) : un joueur peut
-- disparaître du classement public sans quitter ses amis, qui gardent accès
-- à sa progression via la policy RLS existante sur `progress` (acceptés
-- uniquement). La portée reste le classement, comme annoncé à l'écran.

alter table profiles add column hide_stats boolean not null default false;

create or replace view leaderboard as
  select p.user_id, pr.display_name, p.junction_count, p.edge_meters
  from progress p
  join profiles pr on pr.id = p.user_id
  where not pr.hide_stats
  order by p.junction_count desc;
