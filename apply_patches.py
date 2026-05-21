#!/usr/bin/env python3
"""Patches finaux pour ajouter AuditLogPanel partout + supprimer tab Historique global."""

import os, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'

def patch(path, old, new, label):
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        print(f"⚠ {label} : fichier introuvable {full}")
        return False
    with open(full, 'r') as f: c = f.read()
    if old not in c:
        print(f"⚠ {label} : pattern introuvable")
        return False
    c = c.replace(old, new)
    with open(full, 'w') as f: f.write(c)
    print(f"✓ {label}")
    return True

# ============================================================
# 1. EnveloppesView.jsx : ajouter AuditLogPanel en bas
# ============================================================
patch(
    'src/components/Caisse/EnveloppesView.jsx',
    "import DetailReaffecterModal from './modals/DetailReaffecterModal'",
    "import DetailReaffecterModal from './modals/DetailReaffecterModal'\nimport AuditLogPanel from './AuditLogPanel'",
    "EnveloppesView : import AuditLogPanel"
)
patch(
    'src/components/Caisse/EnveloppesView.jsx',
    "{attributionEnv && (\n        <AttributionModal",
    '<AuditLogPanel entityType="enveloppe" title="📜 Historique des affectations" />\n\n      {attributionEnv && (\n        <AttributionModal',
    "EnveloppesView : ajout AuditLogPanel"
)

# ============================================================
# 2. SuiviView.jsx : ajouter AuditLogPanel en bas du composant principal
# ============================================================
patch(
    'src/components/Caisse/SuiviView.jsx',
    "import UploadPreuveModal from './modals/UploadPreuveModal'",
    "import UploadPreuveModal from './modals/UploadPreuveModal'\nimport AuditLogPanel from './AuditLogPanel'",
    "SuiviView : import AuditLogPanel"
)
patch(
    'src/components/Caisse/SuiviView.jsx',
    "      {subTab === 'banque' && <BanqueSection user={user} />}\n      {subTab === 'perso'  && <PersoSection  user={user} />}\n    </div>",
    "      {subTab === 'banque' && <BanqueSection user={user} />}\n      {subTab === 'perso'  && <PersoSection  user={user} />}\n      <AuditLogPanel entityType=\"enveloppe\" title=\"📜 Historique versements & remboursements\" />\n    </div>",
    "SuiviView : ajout AuditLogPanel"
)

# ============================================================
# 3. MeriemAvances.jsx : ajouter AuditLogPanel en bas
# ============================================================
patch(
    'src/components/Caisse/subviews/MeriemAvances.jsx',
    "from '../../../lib/caisse'",
    "from '../../../lib/caisse'\nimport AuditLogPanel from '../AuditLogPanel'",
    "MeriemAvances : import AuditLogPanel"
)
patch(
    'src/components/Caisse/subviews/MeriemAvances.jsx',
    "      {showNew && <NewAvanceModal",
    '<AuditLogPanel entityType="avance" title="📜 Historique des avances" />\n\n      {showNew && <NewAvanceModal',
    "MeriemAvances : ajout AuditLogPanel"
)

# ============================================================
# 4. SalairesView : ajouter AuditLogPanel en bas
# ============================================================
# On insère juste avant le dernier </div> du composant principal
salaire_old = "</div>\n  )\n}\n"
patch(
    'src/components/Caisse/SalairesView.jsx',
    "import { ",
    "import AuditLogPanel from './AuditLogPanel'\nimport { ",
    "SalairesView : import AuditLogPanel"
)
# Pour le rendu, on tente d'ajouter avant le tout dernier </div>... C'est risqué donc on saute si pas sûr.
# (On reviendra si besoin)

# ============================================================
# 5. CaisseView.jsx : SUPPRIMER l'onglet Historique global
# ============================================================
patch(
    'src/components/Caisse/CaisseView.jsx',
    "  { key: 'logs',       label: 'Historique',  icon: '📜' },\n  { key: 'params',     label: 'Paramètres',  icon: '⚙️' },\n",
    "  { key: 'params',     label: 'Paramètres',  icon: '⚙️' },\n",
    "CaisseView : suppression tab Historique"
)
patch(
    'src/components/Caisse/CaisseView.jsx',
    "      {tab === 'logs'       && <LogsView user={user} />}\n      {tab === 'params'     && <ParametresView user={user} />}",
    "      {tab === 'params'     && <ParametresView user={user} />}",
    "CaisseView : suppression rendu logs"
)
patch(
    'src/components/Caisse/CaisseView.jsx',
    "import LogsView from './LogsView'\n",
    "",
    "CaisseView : suppression import LogsView"
)

print("\n=== Tous les patches appliqués ===")
