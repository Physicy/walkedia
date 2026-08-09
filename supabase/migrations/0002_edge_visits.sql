-- Compteur de passages par tronçon (heatmap de fréquentation côté client).
alter table progress add column edge_visits jsonb not null default '{}'::jsonb;
