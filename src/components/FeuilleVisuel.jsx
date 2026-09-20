// ============================================================
// LES MORCEAUX D'ÉCRAN DES DEUX ONGLETS DE FOURNÉE.
//
// « Trop compliqué pour quelqu'un qui ne lit pas / facilite le visuel »
// (Layla, 2026-09-20), en regardant l'onglet de l'économe : trois titres,
// trois paragraphes d'explication, des lignes de 12 px et un vide annoncé par
// « Rien n'est sorti sans avoir été déclaré ».
//
// La même règle que l'écran de fabrication s'applique ici : une photo, un gros
// chiffre, et rien d'autre. « À déclarer » et « Donné » partagent donc ces
// quatre morceaux — les deux écrans doivent se ressembler, ce sont les mêmes
// mains et les mêmes fournées.
// ============================================================

import { useState } from 'react'
import { photoFabAnnexe } from '../lib/fabAnnexe'
import { cheminDe } from '../lib/feuilles'
import { qte } from '../lib/ecranSimple'

/**
 * La photo d'une fournée.
 *
 * ⚠️ CELLE DE SON GÂTEAU, PAS LA SIENNE — la règle est déjà posée dans l'écran
 * de fabrication : une crème ou un biscuit photographié seul ne se reconnaît
 * pas ; la tête de la cascade, elle, se reconnaît.
 *
 * ⚠️ ET SI ODOO N'A PAS D'IMAGE, il répond 404 : le navigateur affiche alors
 * son icône cassée. On essaie donc le gâteau, puis l'article, puis on laisse un
 * carré crème — jamais une image brisée.
 */
export function PhotoFeuille({ f, className = '' }) {
  const noms = [...new Set([cheminDe(f)[0], f.produit].filter(Boolean))]
  const [i, setI] = useState(0)

  if (i >= noms.length) return <div className={`bg-cream-deep ${className}`} />
  return (
    <img
      src={photoFabAnnexe(noms[i])} alt="" loading="lazy"
      onError={() => setI(n => n + 1)}
      className={`object-cover bg-cream-deep ${className}`}
    />
  )
}

/** Le chiffre en gros, l'unité en petit : c'est le chiffre qu'on sert. */
export function GrosseQuantite({ f }) {
  const t = qte(f.qty_prevue, f.unite)
  const i = t.lastIndexOf(' ')
  return (
    <div className="text-[29px] font-extrabold tabular-nums leading-none text-ink">
      {i < 0 ? t : t.slice(0, i)}
      {i > 0 && <span className="text-[15px] font-semibold text-ink-mute ml-1">{t.slice(i + 1)}</span>}
    </div>
  )
}

/** Un titre de section : un emoji, deux mots, un compteur. Pas de phrase. */
export function Bande({ emoji, titre, n, ton = 'bg-cream-deep text-ink-soft' }) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-3">
      <span className="text-[30px] leading-none" aria-hidden="true">{emoji}</span>
      <span className="text-[21px] font-extrabold text-ink">{titre}</span>
      <span className={`ml-auto min-w-[40px] h-10 px-3 rounded-full grid place-items-center
                        text-[20px] font-extrabold tabular-nums ${ton}`}>
        {n}
      </span>
    </div>
  )
}

/** Le vide, en deux mots — jamais une phrase à déchiffrer. */
export function Rien({ emoji, mot }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-8 bg-cream-warm border border-dashed
                    border-line rounded-3xl">
      <span className="text-[42px] leading-none" aria-hidden="true">{emoji}</span>
      <span className="text-[17px] font-extrabold text-ink-soft">{mot}</span>
    </div>
  )
}
