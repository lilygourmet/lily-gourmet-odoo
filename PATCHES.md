# 🔧 PATCHES.md — Les 5 modifs à appliquer aux fichiers existants

Toutes ces modifs sont minimes (1-3 lignes chacune). Le module reste 100% isolé : aucun autre fichier de l'app n'a besoin d'être touché.

---

## 📝 PATCH 1 — `src/App.jsx`

### Ce qu'il faut faire
Ajouter l'import de `CaisseView` et brancher la vue dans le switch `activeView`.

### Étape A : Ajouter l'import en haut du fichier
Trouver le bloc d'imports en haut de `src/App.jsx`, et ajouter cette ligne avec les autres imports de composants :

```jsx
import CaisseView from './components/Caisse/CaisseView'
```

### Étape B : Ajouter la route dans le rendu
Trouver le switch `activeView` (ou les conditions `activeView === 'xxx' && <Xxx />`) dans `src/App.jsx`.

Ajouter cette ligne au même niveau que les autres vues :

```jsx
{activeView === 'caisse' && <CaisseView user={user} />}
```

**Exemple de contexte** (à adapter selon ton code actuel) :
```jsx
{activeView === 'calendar' && <CalendarView user={user} />}
{activeView === 'stock'    && <StockView user={user} />}
{activeView === 'caisse'   && <CaisseView user={user} />}    {/* ← LIGNE AJOUTÉE */}
{activeView === 'admin'    && <AdminUsers user={user} />}
```

---

## 📝 PATCH 2 — `src/components/AppHeader.jsx`

### Ce qu'il faut faire
Ajouter un bouton "💰 Caisse" dans le menu, visible pour les utilisateurs avec `perm_caisse` ou `perm_caisse_admin`.

### Étape A : Importer le helper de permission
Tout en haut de `src/components/AppHeader.jsx`, au niveau des imports auth, ajouter :

```jsx
import { canSeeCaisse } from '../lib/auth'
```

(Ou ajouter `canSeeCaisse` à un import existant depuis `'../lib/auth'`)

### Étape B : Ajouter le bouton dans le menu

Trouve l'endroit où sont rendus les boutons du menu Outils (admin) — c'est généralement un bloc qui ressemble à :

```jsx
{canSeeChecklist(user) && (
  <button onClick={() => setActiveView('checklist')}>📋 Checklist</button>
)}
```

Ajouter juste après (ou à l'endroit que tu préfères dans le menu) :

```jsx
{canSeeCaisse(user) && (
  <button onClick={() => { setActiveView('caisse'); setMenuOpen?.(false) }}>
    💰 Caisse
  </button>
)}
```

### Étape C : (Optionnel) Vue Meriem connectée
Si tu veux que Meriem (avec `perm_caisse` seul, sans `perm_caisse_admin`) voie directement la caisse à la racine quand elle se connecte, dans `pickPrimaryNav` (ou équivalent), ajoute en début :

```js
if (user?.perm_caisse && !user?.perm_caisse_admin) return 'caisse'
```

---

## 📝 PATCH 3 — `src/lib/auth.js`

### Ce qu'il faut faire
1. Ajouter `perm_caisse` et `perm_caisse_admin` dans le SELECT de `getCurrentUser`
2. Exporter les 2 helpers `canSeeCaisse` et `canAdminCaisse`

### Étape A : Étendre le SELECT
Trouver la fonction `getCurrentUser` (ou équivalent) qui fait un select sur `profiles`. Repérer la liste des champs sélectionnés, par exemple :

```js
.select('id, username, role, perm_stock_gs, perm_checklist, perm_cake_vision, ...')
```

Ajouter `perm_caisse, perm_caisse_admin` :

```js
.select('id, username, role, perm_stock_gs, perm_checklist, perm_cake_vision, perm_caisse, perm_caisse_admin, ...')
```

### Étape B : Ajouter les 2 helpers à la fin du fichier

```js
export function canSeeCaisse(user) {
  return !!(user?.perm_caisse || user?.perm_caisse_admin || user?.role === 'admin')
}

export function canAdminCaisse(user) {
  return !!(user?.perm_caisse_admin || user?.role === 'admin')
}
```

---

## 📝 PATCH 4 — `src/lib/users.js`

### Ce qu'il faut faire
Ajouter `perm_caisse` et `perm_caisse_admin` aux whitelists de chargement / création / mise à jour des utilisateurs.

### Étape A : SELECT (chargement de la liste)
Trouver le `.select(...)` dans la fonction de chargement (souvent `loadUsers` ou `getUsers`), ajouter :

```js
.select('id, username, role, ..., perm_caisse, perm_caisse_admin')
```

### Étape B : INSERT (création d'un user)
Si la fonction de création utilise une whitelist d'attributs (genre `Object.keys(data).filter(...)` ou un tableau explicite), ajouter :

```js
'perm_caisse',
'perm_caisse_admin',
```

### Étape C : UPDATE (mise à jour d'un user)
Idem pour la fonction d'update — ajouter ces 2 noms aux champs autorisés.

---

## 📝 PATCH 5 — `src/components/AdminUsers.jsx`

### Ce qu'il faut faire
Ajouter 2 checkboxes dans le formulaire d'édition d'un utilisateur, à côté des autres permissions.

### Trouver où sont rendues les autres checkboxes de permission

Repérer un bloc qui ressemble à (les noms peuvent varier) :

```jsx
<label>
  <input
    type="checkbox"
    checked={editingUser.perm_checklist || false}
    onChange={(e) => setEditingUser({ ...editingUser, perm_checklist: e.target.checked })}
  />
  Checklist
</label>
```

### Ajouter juste après

```jsx
<label>
  <input
    type="checkbox"
    checked={editingUser.perm_caisse || false}
    onChange={(e) => setEditingUser({ ...editingUser, perm_caisse: e.target.checked })}
  />
  Caisse (vue limitée — pour Meriem)
</label>

<label>
  <input
    type="checkbox"
    checked={editingUser.perm_caisse_admin || false}
    onChange={(e) => setEditingUser({ ...editingUser, perm_caisse_admin: e.target.checked })}
  />
  Caisse · admin (accès complet)
</label>
```

---

## ✅ Récap — Workflow complet de déploiement

1. **SQL Supabase** : exécute `supabase/caisse_setup.sql` dans Supabase SQL Editor
2. **Décompresser le zip** dans `lily-gourmet-odoo/` à la racine
3. **Appliquer les 5 patches** de ce fichier
4. **Variable Vercel** : ajouter `ODOO_POS_CASH_METHOD_NAME = Espèces`
5. **(Optionnel) Cron** : ajouter `vercel.json` avec le cron 30 min
6. **Commit + push** sur GitHub → Vercel auto-déploie
7. **Donner perms** : dans Admin Users, coche `perm_caisse_admin` sur ton compte Layla
8. **Premier usage** :
   - Module Caisse → Paramètres → "🔍 Détecter sessions Odoo"
   - Module Caisse → Enveloppes → "🔄 Synchroniser"
   - Affecter les premières enveloppes 🎉

---

## 🧪 Tests rapides à faire après déploiement

- [ ] Je vois le bouton "💰 Caisse" dans mon header
- [ ] L'onglet Paramètres charge sans erreur
- [ ] Le bouton "Détecter sessions Odoo" liste mes config POS (Café, Boutique)
- [ ] Le bouton "Synchroniser" sur Enveloppes crée des cartes grises
- [ ] Je clique sur une carte grise → modal d'attribution apparaît
- [ ] J'affecte à "Meriem" → carte devient verte
- [ ] Onglet Caisses gérées → Meriem → la caisse a l'entrée correspondante

Si un de ces points ne marche pas, ouvre la console (F12) et envoie-moi le message d'erreur.
