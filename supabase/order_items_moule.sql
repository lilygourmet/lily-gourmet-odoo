-- Champ « Moule » des produits décorés (cake design) : ce qui est fait au moule.
-- Rempli à la prise de commande, affiché sur la fiche prod + impression (masqué si vide).
alter table order_items add column if not exists moule text;
