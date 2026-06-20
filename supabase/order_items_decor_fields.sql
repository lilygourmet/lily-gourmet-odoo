-- Champs « anti-erreur » des produits décorés (cake design CD- et GM-/GMD-),
-- remplis à la prise de commande et affichés sur la fiche prod + impression.
alter table order_items add column if not exists modele     text;  -- à l'identique / inspiration
alter table order_items add column if not exists modelage   text;  -- ce qui est modelé à la main
alter table order_items add column if not exists impression text;  -- ce qui est imprimé
alter table order_items add column if not exists decor      text;  -- « rien à faire » le cas échéant
alter table order_items add column if not exists fleurs     text;  -- pâte à sucre / artificielles / vraies + détail
