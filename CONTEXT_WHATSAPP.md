# Projet Lily Gourmet — Module WhatsApp Business (Niveau 3)

## Contexte
Suite d'un projet discuté avec Claude.ai (chat web). Je passe sur Claude Code pour la suite technique. Lily Gourmet est une PME marocaine (traiteur événementiel, 2 sociétés : L&N Gourmet SARL et LG Traiteur SARL).

## Problème à résoudre
Les 2 commerciaux (Hassan et Souad) reçoivent des commandes via appels et WhatsApp. Ils oublient régulièrement de relancer ou de noter les modifications. On veut intégrer WhatsApp Business API dans Lily Gourmet pour avoir une inbox partagée et des alertes automatiques.

## Décisions déjà prises
- BSP : Wati (~45$/mois, officiel Meta)
- Numéro WhatsApp : nouveau numéro Maroc dédié (compte WhatsApp Business supprimé, 24h d'attente en cours avant inscription Wati)
- Attribution conversations : MANUEL (1er commercial qui clique "Je prends")
- Auto-réponses : à ajouter PLUS TARD (phase 2)
- Accès inbox : admins (Layla) + 2 commerciaux (Hassan, Souad)
- Notifications mobile push : OUI (PWA, on a déjà push-send.js et push-subscribe.js)
- Vercel : décision en attente — Pro à 20$/mois OU consolider 12 fonctions API
- Volume estimé : 1200 conversations/mois (40/jour)
- Budget total accepté : ~75€/mois (Wati + Vercel Pro + numéro + Meta)
- Compte Meta Business Manager : déjà existant, "Lily Gourmet", PAS besoin de vérification entreprise

## Roadmap technique
1. Décision Vercel : Pro 20$/mois vs consolidation des 12 fonctions API
2. Tables Supabase : conversations, messages, conversation_events
3. Module React : src/components/Conversations/ (InboxView, ConversationDetail)
4. Webhook Wati : api/wati-webhook.js
5. Système d'alertes : 30 min / 2h / 3 jours
6. Notifications push mobile : réutiliser push-send.js existant
7. Test E2E avec Wati sandbox avant prod

## Stack
- React 19 + Vite + Vercel
- Supabase (auth custom via table profiles)
- 12 fonctions API actuelles : caisse-api.js, catalog-from-odoo.js, freezer-list.js, labels-client-zpl.js, labels-zpl.js, pointage-api.js, push-send.js, push-subscribe.js, stock-odoo-snapshot.js, sync-etiquettes.js, sync-now.js, sync-odoo.js

## Points d'attention CRITIQUES
- Ne PAS casser sync-odoo.js (37 KB) ni pointage-api.js (20 KB) — modules en prod
- push-send.js et push-subscribe.js sont déjà en prod, à RÉUTILISER (pas refaire)
- Auth custom (table profiles), pas Supabase Auth. Pour les policies RLS storage on utilise anon+authenticated comme pour task-attachments et caisse-preuves
- Onglet Conversations à ajouter dans la nav, accessible admin + commerciaux

## Première question à me poser
Avant de coder : audite le dossier api/ et donne-moi ta reco entre :
(A) Upgrader Vercel Pro à 20$/mois — 0 risque, fonctions illimitées
(B) Consolider les 12 fonctions en un router — 0 euro mais 2-3 jours de refactor risqué

Mon premier instinct (Claude.ai) c'était de recommander (A) à cause du risque sur sync-odoo.js et pointage-api.js. Mais tu as accès au vrai code, donne ton avis.