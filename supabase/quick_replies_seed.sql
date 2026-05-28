-- ============================================================
-- LILY GOURMET — Conversations : réponses rapides (phrases types)
-- À exécuter UNE FOIS dans Supabase SQL Editor.
-- (Si la table n'existe pas : lancer d'abord conversations_quick_replies.sql)
-- ============================================================

INSERT INTO quick_replies (label, body, ordre) VALUES
('Acompte 50 %',
'Pour confirmer votre commande, nous vous demandons de bien vouloir verser un acompte de 50 %.

Vous pouvez soit passer en boutique pour le régler, soit effectuer un virement bancaire « INSTANTANÉ », s''il vous plaît. Nous pouvons également vous envoyer un lien de paiement sécurisé pour régler par carte bancaire.

Merci de votre compréhension et de votre collaboration !', 10),

('Parfums disponibles',
'Voici les parfums disponibles :
• Vanille
• Chocolat
• Praliné chocolaté
• Praliné amandes caramélisées
• Citron
• Oreo

Il y a également l''option fraisier, mais pour ce parfum il faudra prévoir de récupérer votre commande après 16 h. Les fraises arrivent parfois en retard, ce qui peut ralentir toute la chaîne de préparation.

Merci de votre compréhension !', 20),

('Fraisier — après 16 h',
'Pour l''option fraisier, il faudra prévoir de récupérer votre commande après 16 h. Les fraises arrivent parfois en retard, ce qui peut ralentir toute la chaîne de préparation.', 30),

('Première commande + hauteur',
'Est-ce la première fois que vous commandez chez nous ?

Je voudrais simplement vous expliquer que nous ajoutons une fausse hauteur à nos gâteaux. Nos gâteaux ont une hauteur de 5 cm, à laquelle nous ajoutons différentes tailles de polystyrène pour atteindre la hauteur souhaitée.

Je vais vous envoyer des photos pour que vous compreniez mieux.', 40),

('Fausse hauteur (gâteaux)',
'Je voudrais simplement vous expliquer que nous ajoutons une fausse hauteur à nos gâteaux. Nos gâteaux ont une hauteur de 5 cm, à laquelle nous ajoutons différentes tailles de polystyrène pour atteindre la hauteur souhaitée.

Je vais vous envoyer des photos pour que vous compreniez mieux.', 50),

('Horaire de récupération',
'Merci de nous communiquer l''horaire limite qui vous convient, afin que tout soit prêt dans les meilleures conditions. 🙏

Nous faisons de notre mieux pour respecter la ponctualité. Cependant, il arrive que certains clients demandent un horaire précis mais arrivent beaucoup plus tard, ce qui impacte notre organisation.

Votre collaboration nous aidera à mieux vous servir ! 🙏🤗', 60),

('Pourquoi un acompte',
'Je comprends tout à fait, mais il nous est malheureusement déjà arrivé que des commandes restent entre nos mains sans être récupérées.

C''est pourquoi l''administration nous demande un acompte pour confirmer les commandes. Merci pour votre compréhension !', 70),

('Capacité maximale atteinte',
'Nous avons atteint notre capacité maximale de commandes et ne pouvons malheureusement plus en prendre. Désolés pour ce désagrément ! Nous espérons vous servir une prochaine fois. Merci pour votre compréhension. 😊
À bientôt ! 🍰✨', 80),

('Brief gâteau anniversaire',
'Bonjour 😊
Pour le gâteau d''anniversaire, pouvez-vous me préciser s''il vous plaît :
• La date et l''heure souhaitées ?
• Le nombre de personnes ?
• Avez-vous déjà un modèle en tête ? Vous pouvez me l''envoyer en photo.

Sinon, dites-moi simplement le thème souhaité et je vous enverrai quelques propositions adaptées. 🎂', 90),

('Parfums (EN)',
'Here are the available flavors:
• Vanilla
• Chocolate
• Chocolate praline
• Caramelized almond praline
• Lemon
• Oreo', 100),

('Première commande + hauteur (EN)',
'Is this your first time ordering from us?

I''d just like to explain that we add an artificial height to our cakes. Our cakes are 5 cm tall, and we add different sizes of polystyrene to reach the desired height.

I''ll send you some photos so you can understand better.', 110),

('Acompte 50 % (EN)',
'To confirm your order, we kindly ask for a 50% deposit.

You can either come to our store to pay, or make an instant bank transfer, please. We can also send you a secure payment link to pay by card.

Thank you for your understanding!', 120),

('Lien entremets',
'Voici le lien vers nos entremets :
https://lily-gourmet.com/shop/category/patisseries-entremets-28', 130),

('Livraison Casablanca',
'Bonjour,

Nous livrons à Casablanca pour un panier d''achat minimum de 3 000 DH, hors frais de livraison.

N''hésitez pas à nous contacter pour toute information complémentaire ou pour passer commande.

Bonne journée !', 140),

('Créneau de livraison (2 h)',
'Nous pouvons assurer la livraison. Cependant, nous vous remercions de nous communiquer un créneau de 2 heures.

En raison du nombre important de livraisons à effectuer, notre livreur ne peut malheureusement pas garantir une heure de passage précise.

Merci de votre compréhension.', 150),

('Localisation',
'Voici notre localisation 📍

Lily Gourmet
Tél : 05376-53186
https://goo.gl/maps/d1oWnUWU77gRj98V6', 160);
