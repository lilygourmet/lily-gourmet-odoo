-- Permission « Cake Vision » (éditeur IA de photos de gâteaux, séparée de « Galerie CD »).
alter table profiles add column if not exists perm_cake_vision_edit boolean default false;
