-- Économat : tous les PRODUITS FRAIS se commandent (demande de prix)
-- ---------------------------------------------------------------------------
-- Suite de economat_achat_fruits.sql. Règle de Layla (2026-08-27) : les frais
-- ne sont pas pris sur le stock du magasin, on les commande au fournisseur —
-- et ça vaut pour TOUTE l'économat, pas seulement la Boutique.
-- La marchandise est réceptionnée au lieu de travail du badge (boutique →
-- stock de vente, cake design/finition → stock de prod, annexe → prod annexe).
--
-- Exception : la CUISINE prend ses frais chez LG traiteur. Rien à faire ici —
-- ses articles sont marqués odoo_source = 'lgt' et sont exclus ci-dessous
-- (leur numéro de produit désigne un article de l'AUTRE base Odoo).
--
-- 40 produits, repérés par leur numéro dans l'Odoo principal :
--   • 18 fruits « F- » : ananas, banane, cerise, citron, fraise (+ congelée),
--     framboise (+ congelée), gingembre, mangue, myrtilles (+ congelé), mûre,
--     noix de coco, orange, pamplemousse, passion, pommes
--   • 11 purées de fruits : abricot, ananas, cassis, citron jaune, citron vert,
--     coco, fraise, framboise, mangue, myrtille, passion
--   • 4 œufs : blanc, entier, jaune, plateau de 30
--   • beurre Centrale, beurre entremets  (PAS le beurre de cacao : pas un frais)
--   • crème whipping, mascarpone, crème pâtissière Meggle,
--     bombe crème chantilly, yaourt nature

update economat_articles
   set achat = true
 where coalesce(odoo_source, 'principal') <> 'lgt'
   and odoo_product_id in (
     -- fruits F-
     753, 3410, 6952, 810, 5971, 2924, 2925, 866, 874, 2893,
     2927, 903, 6007, 2994, 911, 6541, 3781, 5968,
     -- purées de fruits
     936, 937, 6831, 4796, 4782, 938, 4083, 939, 2910, 2792, 941,
     -- œufs
     5939, 5940, 5941, 5277,
     -- beurres
     5943, 5942,
     -- crèmes et laitiers
     5985, 5977, 5984, 3023, 6547
   );
