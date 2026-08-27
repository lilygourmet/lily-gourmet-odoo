-- Économat : articles qui partent en ACHAT plutôt qu'en transfert interne
-- ---------------------------------------------------------------------------
-- Certains articles ne sont pas en stock au magasin d'achats : on les commande
-- au fournisseur. Pour ceux-là, la demande d'économat crée une DEMANDE DE PRIX
-- dans Odoo (une par fournisseur) au lieu d'un transfert interne — comme ce qui
-- se fait déjà pour les articles LG traiteur.
--
-- Décision de Layla (2026-08-27) : tout le groupe « Fruits & Purées » de la
-- Boutique (orange, myrtilles, citron, gingembre, jus et purées).
-- Pour en ajouter d'autres plus tard : passer `achat` à true sur l'article.

alter table economat_articles
  add column if not exists achat boolean not null default false;

update economat_articles
   set achat = true
 where group_id = (
   select g.id from economat_groups g
     join economat_categories c on c.id = g.category_id
    where g.name = 'Fruits & Purées' and c.name = 'Boutique'
   );
