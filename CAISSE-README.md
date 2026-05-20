# 💰 Lily Gourmet — Module "Gestion de Caisse"

Bienvenue ! Ce module est **totalement isolé** dans `src/components/Caisse/` et ne touche au reste de l'app que via 5 fichiers de "branchement" (modifs minimales) + 1 perm SQL.

---

## 📋 INSTRUCTIONS DE DÉPLOIEMENT (≈ 10 minutes)

### Étape 1 — Exécuter le SQL dans Supabase

1. Aller sur https://supabase.com/dashboard/project/nsmwcrebjhvtopjdnsun/sql
2. Coller le contenu de `supabase/caisse_setup.sql`
3. Cliquer **Run**

Ce SQL crée :
- 10 nouvelles tables `caisse_*` (zéro impact sur tes tables existantes)
- 2 colonnes `perm_caisse` et `perm_caisse_admin` dans `profiles`
- 1 bucket Storage `caisse-preuves` (gratuit jusqu'à 1 GB)
- Toutes les RLS policies
- Les destinataires + catégories + salaires par défaut

### Étape 2 — Copier les nouveaux fichiers

Décompresser ce zip dans le repo, à la racine `lily-gourmet-odoo/`.

Tu obtiendras :
```
src/components/Caisse/                  ← tout neuf
├─ CaisseView.jsx + 5 autres jsx au niveau racine
├─ subviews/ (4 fichiers)
├─ modals/ (11 fichiers)
└─ _helpers.js

src/lib/caisse.js                       ← tout neuf

api/caisse-sync-pos.js                  ← tout neuf
api/caisse-pos-list.js                  ← tout neuf

supabase/caisse_setup.sql               ← à exécuter (étape 1)
```

### Étape 3 — Modifier 5 fichiers existants (1 modif minimale par fichier)

Voir les patches détaillés dans `PATCHES.md` du zip.

### Étape 4 — Ajouter UNE variable Vercel

Aller dans https://vercel.com → ton projet → Settings → Environment Variables :

```
ODOO_POS_CASH_METHOD_NAME = Espèces
```

(Toutes les autres variables Odoo et Supabase sont déjà présentes ✓)

### Étape 5 — (Optionnel) Activer le cron Vercel

Ajouter dans `vercel.json` à la racine (ou créer le fichier si pas existant) :

```json
{
  "crons": [
    {
      "path": "/api/caisse-sync-pos",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

Si tu n'ajoutes pas ça, pas grave : le bouton "🔄 Synchroniser" dans l'app suffit pour démarrer.

### Étape 6 — Commit + push

```bash
git add .
git commit -m "Ajout module Gestion de Caisse v1"
git push
```

Vercel auto-déploie en 1-2 minutes.

### Étape 7 — Te donner les permissions

Dans l'app, va dans **Admin Users**, sur ton compte coche :
- ✅ `perm_caisse_admin` (accès complet au module Caisse)

Pour Meriem (si tu veux qu'elle ait sa vue dédiée plus tard) :
- ✅ `perm_caisse` (accès uniquement à sa propre caisse)

### Étape 8 — Premier usage

1. Va dans **💰 Caisse** dans le header
2. Onglet **Paramètres** → bouton **"🔍 Détecter les sessions Odoo"** → Café + Boutique apparaissent
3. Retour onglet **Enveloppes** → clique **"🔄 Synchroniser"** → les sessions POS fermées récentes apparaissent
4. Clique sur les cartes "À affecter" → choisis le destinataire 🎉

---

## 🧪 Si y a un bug

- Module isolé = ton app principale ne peut PAS être impactée
- Si erreur dans Caisse → clic sur les autres modules continue de marcher
- Pour debugger : ouvre la console navigateur (F12) → onglet **Console**

---

## 📦 Structure des fichiers livrés

```
zip-content/
├─ supabase/
│  └─ caisse_setup.sql                         ← à exécuter dans Supabase SQL Editor
├─ src/
│  ├─ components/Caisse/
│  │  ├─ CaisseView.jsx                        (racine + nav des 5 onglets)
│  │  ├─ EnveloppesView.jsx                    (onglet 1 : grille N-colonnes)
│  │  ├─ SuiviView.jsx                         (onglet 2 : banque + perso)
│  │  ├─ CaissesGereesView.jsx                 (onglet 3 : router Meriem/Layla)
│  │  ├─ SalairesView.jsx                      (onglet 4 : dashboard salaires)
│  │  ├─ ParametresView.jsx                    (onglet 5 : config)
│  │  ├─ MeriemUserView.jsx                    (vue simplifiée Meriem)
│  │  ├─ _helpers.js                           (couleurs, formatters, constantes)
│  │  ├─ subviews/
│  │  │  ├─ MeriemCaisse.jsx                   (caisse principale + composant générique)
│  │  │  ├─ MeriemHamid.jsx                    (sous-compte Hamid)
│  │  │  ├─ MeriemFactures.jsx                 (suivi factures)
│  │  │  └─ LaylaLG.jsx                        (réutilise MeriemCaisse en mode layla_lg)
│  │  └─ modals/
│  │     ├─ AttributionModal.jsx
│  │     ├─ DetailReaffecterModal.jsx
│  │     ├─ UploadPreuveModal.jsx
│  │     ├─ AjoutSortieModal.jsx               (export aussi ModalBox réutilisable)
│  │     ├─ AjoutEntreeModal.jsx
│  │     ├─ AjoutAvanceHamidModal.jsx
│  │     ├─ AjoutDepenseHamidModal.jsx
│  │     ├─ HamidRendModal.jsx
│  │     ├─ MarquerFactureRecupereeModal.jsx
│  │     ├─ CompositionSalaireModal.jsx
│  │     └─ ClotureMoisModal.jsx
│  └─ lib/caisse.js                            (queries Supabase isolées)
├─ api/
│  ├─ caisse-sync-pos.js                       (sync Odoo POS → enveloppes)
│  └─ caisse-pos-list.js                       (détection configs POS)
├─ PATCHES.md                                  ← les 5 modifs à appliquer aux fichiers existants
└─ README.md                                   ← ce fichier
```

---

## 🎨 Récap des fonctionnalités

- ✅ **Vue principale enveloppes** : grille N-colonnes par source POS, onglets mois, filtres par destinataire
- ✅ **Affectation 1-clic** : 5 boutons colorés (Meriem/Layla LG/Banque/Nezha perso/Layla perso)
- ✅ **Réaffectation / retour à gris** possible
- ✅ **Suivi versements bancaires** : liste, dates éditables, upload preuves
- ✅ **Suivi remboursements perso** : split 2 colonnes Nezha/Layla, upload preuves
- ✅ **Caisse Meriem** : 3 sous-onglets (Caisse / Hamid / Factures)
- ✅ **Caisse Layla LG** : caisse simple
- ✅ **Sous-compte Hamid** : avances + dépenses + solde (peut être négatif)
- ✅ **Factures à récupérer** : tracking auto, récupération → entrée caisse Layla LG
- ✅ **Salaires** : composition avec cumul d'enveloppes, reliquat à affecter, statuts brouillon/prêt/payé
- ✅ **Paramètres** : destinataires + couleurs, catégories par caisse, salaires défaut, sessions POS
- ✅ **Vue Meriem connectée** : ultra-simplifiée si elle a perm_caisse sans perm_caisse_admin
- ✅ **Clôture mensuelle** : verrouille les mouvements, génère bilan

---

## ⚠️ Limitations connues v1

- Pas de notifications push (par choix)
- Pas d'export PDF/Excel des clôtures (à ajouter en v2 si besoin)
- Pas de rappel email pour factures à récupérer trop anciennes
- Reliquat salaire → si destination = `nezha_perso` ou `layla_perso`, c'est juste tracé dans la table salaires, pas créé d'entrée auto (car il n'y a pas de caisse pour ces destinataires)

---

## 🐛 Support

En cas de souci ou amélioration souhaitée, dis-moi à la prochaine session.

Bon usage ! 🥐
