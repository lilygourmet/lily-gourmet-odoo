# Améliorations restantes — guide pour Layla

Ces 3 chantiers nécessitent une action de ta part (compte, réglage, ou validation).
À faire **avec Claude**, pas en pleine nuit sans surveillance.

---

## 1. 🔒 Sécurité (priorité, mais c'est un VRAI chantier)

### Le problème (vérifié)
L'app parle à la base de données avec une **clé publique** (visible dans le site) et des
**règles d'accès ouvertes** (`USING (true)`). Conséquences vérifiées :
- N'importe qui peut lire **toutes les conversations clients + numéros** (`conversations`, `messages`).
- Tout utilisateur connecté (même sans permission) peut lire/écrire **caisse + salaires**.
- Plusieurs endpoints API (`caisse-api`, `pointage-api`, actions de `wati-webhook`) sont
  appelables **sans authentification** depuis internet.

### Pourquoi on ne peut pas « juste resserrer »
Toute l'app **repose** sur cet accès ouvert (auth maison, pas l'auth Supabase). Si on resserre
les règles sans rien d'autre, **l'app perd l'accès aux données → écran cassé partout**.

### Le plan (à faire ensemble, étape par étape, en testant à chaque fois)
1. **Endpoints API d'abord** (moins risqué) : ajouter une vérification sur `caisse-api`,
   `pointage-api`, et les actions sensibles de `wati-webhook`. Il faut un moyen pour le site de
   prouver « c'est bien un user connecté » → on décidera : jeton de session signé, ou passer ces
   appels par un endpoint qui revérifie côté serveur.
2. **RLS ensuite** : restreindre table par table (`conversations` → seulement via endpoint serveur ;
   `caisse_*` → par rôle), en **testant après chaque table** qu'on n'a rien cassé.
3. Idéalement : migrer l'identification vers un **jeton vérifiable côté serveur** (le vrai correctif
   de fond). C'est le plus gros morceau.

⚠️ **Ne lance aucun SQL de RLS seule** sans tester juste après que l'app marche encore.

---

## 2. ⚙️ Déploiement automatique

Aujourd'hui : `git push` ne publie pas, et le build automatique de Vercel a déjà sorti du **code
périmé** par le passé. La méthode fiable est le déploiement manuel « prebuilt ».

### Meilleure option : GitHub Actions qui déploie en « prebuilt »
On peut créer un workflow GitHub (comme celui de la synchro) qui, à chaque push sur `main` :
`vite build` en local → `vercel deploy --prebuilt --prod`. Ça **automatise la méthode fiable**
sans le piège du build Vercel.

**Ce qu'il faudra :**
- Un secret GitHub **`VERCEL_TOKEN`** (créé dans Vercel → Account Settings → Tokens).
- Claude prépare le workflow `.github/workflows/deploy.yml`.

---

## 3. 🐞 Suivi d'erreurs (Sentry)

Pour être alertée quand l'app plante chez un utilisateur (au lieu de ne jamais le savoir).

**Ce qu'il faudra :**
1. Créer un compte gratuit sur **sentry.io** → nouveau projet « React » → copier le **DSN**.
2. Donner le DSN à Claude.
3. Claude installe `@sentry/react` + l'initialise (capture les erreurs automatiquement).

---

## ✅ Déjà fait cette session (pour mémoire)
- Tests automatiques (`npm test`)
- Alerte livreur sans WhatsApp
- Montants caisse sécurisés (4 modales)
- Heure récap/livraisons fiable (fuseau Maroc)
- Vitesse : bundle principal 2,4 Mo → ~0,8 Mo (écrans chargés à la demande)
- Synchro Odoo automatique (GitHub Actions, toutes les 30 min)
