// ============================================================
// « Fabrication Annexe 2 », version simplifiée.
//
// Pour des gens qui lisent peu : une photo, un gros chiffre, et rien d'autre.
// Trois règles tenues du début à la fin (Layla, 2026-09-10) :
//   • une photo vaut mieux qu'un nom
//   • un chiffre vaut mieux qu'une phrase
//   • une seule chose à faire par écran
//
// Ce qui a disparu par rapport à l'ancien écran : le mot « tournée », les
// mini/maxi, la jauge, « recette d'origine », « tu n'en as pas besoin
// maintenant », « quantité figée », « en attente de validation ». Tout ce qui
// n'aide pas à faire le geste.
//
// Ce qui reste : le STOCK — « on peut voir si erreur » — et sous chaque gros
// chiffre, ce qu'il veut dire en vrai : « 4 plaques · 2 800 g en tout ».
// ============================================================
import { useState } from 'react'
import { enClair, declares, bloquants, aFaireMaintenant,
  decoupeDe, partageDecoupe, ingredientsPour, nomCourt } from '../lib/fabAnnexe'
import { nb, qte, propre } from '../lib/ecranSimple'

/** La photo d'un article, servie par Odoo. */
const photoDe = nom => '/api/fab-annexe?photo=' + encodeURIComponent(nom)

/**
 * L'accueil : ce qu'il y a à faire, en cases. Une photo, un nom court, et le
 * nombre à faire dans une pastille rouge. Pas de titre de section, pas d'état,
 * pas de mini ni de maxi — c'est le réglage de Layla, pas le travail de
 * l'atelier.
 */
export function CasesAFaire({ articles, onOuvrir }) {
  const liste = articles || []
  if (!liste.length) {
    return (
      <p className="text-center text-[19px] font-bold text-ink-mute py-20">
        Rien à faire pour l'instant
      </p>
    )
  }
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {liste.map(a => (
        <button key={a.produit} onClick={() => onOuvrir(a.produit)}
          className="text-left rounded-2xl border border-cream-deep bg-cream-warm overflow-hidden
                     shadow-sm active:scale-[0.98] transition-transform">
          <div className="relative">
            <img src={photoDe(a.photo || a.produit)} alt="" loading="lazy"
              className="w-full aspect-square object-cover bg-cream-deep" />
            <span className="absolute left-2 top-2 rounded-full bg-danger text-cream
                             px-3 py-1 text-[19px] font-extrabold tabular-nums">
              {nb(aFaireMaintenant(a))}
            </span>
          </div>
          <div className="px-3 py-2">
            <div className="text-[16px] font-bold leading-tight">
              {propre(a.libelle || a.produit)}
            </div>
            {/* Le besoin total sous le nom, quand une fournée n'y suffit pas :
                la pastille dit quoi faire maintenant, cette ligne dit pourquoi. */}
            {a.reste > aFaireMaintenant(a) && (
              <div className="text-[12.5px] text-ink-mute mt-0.5">
                il en faut {nb(Math.round(a.reste))}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

/**
 * Le clavier-calculette. Le « + » et le « − » vont de 1 en 1 ou de 50 g en
 * 50 g ; pour passer de 3 920 à 2 600, ça ferait vingt-six appuis. On tape le
 * nombre. « Garde le clavier calculette pour tous les chiffres si besoin de
 * modifier » (Layla, 2026-09-10) — donc TOUT chiffre modifiable s'ouvre ici.
 *
 * Pas de calcul, pas d'opérateurs : des touches, une virgule, une gomme.
 */
export function Clavier({ titre, valeur, unite, onValider, onFermer }) {
  const [txt, setTxt] = useState(String(valeur ?? ''))
  const taper = k => setTxt(t => {
    if (k === ',') return t.includes(',') ? t : (t || '0') + ','
    // Le premier chiffre tapé REMPLACE la valeur proposée : elle vient
    // corriger, pas rallonger. Taper « 26 » sur « 13 » doit donner 26.
    return (t === String(valeur ?? '') ? '' : t) + k
  })
  const n = Number(String(txt).replace(',', '.'))
  const bon = txt !== '' && Number.isFinite(n) && n >= 0

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end" onClick={onFermer}>
      <div className="w-full bg-cream rounded-t-3xl p-4 pb-8" onClick={e => e.stopPropagation()}>
        <div className="text-[15px] font-bold text-ink-mute text-center">{titre}</div>
        <div className="text-center font-extrabold tabular-nums text-[46px] leading-tight my-2">
          {txt || '0'}<span className="text-[19px] text-ink-mute ml-2">{unite === 'u' ? '' : unite}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0'].map(k => (
            <button key={k} onClick={() => taper(k)}
              className="h-16 rounded-2xl bg-cream-warm border-2 border-cream-deep
                         text-[27px] font-extrabold active:bg-cream-deep">{k}</button>
          ))}
          <button onClick={() => setTxt(t => t.slice(0, -1))} aria-label="Effacer"
            className="h-16 rounded-2xl bg-cream-warm border-2 border-cream-deep
                       text-[27px] font-extrabold active:bg-cream-deep">⌫</button>
        </div>
        {/* Une coche, pas un mot : le clavier se referme sur le nombre, il ne
            valide pas le travail. Deux boutons « C'est bon » à l'écran, c'est
            un piège à doigt. */}
        <button onClick={() => bon && onValider(n)} disabled={!bon}
          aria-label="Valider le nombre"
          className={`w-full mt-3 rounded-2xl py-4 text-[27px] font-extrabold leading-none
            ${bon ? 'bg-success text-cream' : 'bg-cream-deep text-ink-mute'}`}>
          ✓
        </button>
      </div>
    </div>
  )
}

/**
 * Le gros chiffre, avec son « − », son « + » et le clavier sous le doigt.
 * Un seul endroit pour tous les nombres de l'écran : le geste est le même
 * partout, et une correction de comportement les corrige tous.
 */
export function GrosChiffre({ titre, valeur, unite, pas = 1, onChange }) {
  const [clavier, setClavier] = useState(false)
  return (
    <>
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => onChange(Math.max(0, Math.round((valeur - pas) * 100) / 100))}
          disabled={valeur <= 0} aria-label={`Moins ${titre}`}
          className="w-16 h-16 rounded-3xl border-2 border-cream-deep bg-cream-warm
                     text-[34px] font-extrabold text-bordeaux leading-none disabled:opacity-30">−</button>
        <button onClick={() => setClavier(true)} aria-label={`Changer ${titre}`}
          className="min-w-[130px] text-center font-extrabold tabular-nums text-[54px] leading-none">
          {nb(valeur)}
        </button>
        <button onClick={() => onChange(Math.round((valeur + pas) * 100) / 100)}
          aria-label={`Plus ${titre}`}
          className="w-16 h-16 rounded-3xl border-2 border-cream-deep bg-cream-warm
                     text-[34px] font-extrabold text-bordeaux leading-none">+</button>
      </div>
      {clavier && (
        <Clavier titre={titre} valeur={valeur} unite={unite}
          onValider={v => { onChange(v); setClavier(false) }}
          onFermer={() => setClavier(false)} />
      )}
    </>
  )
}

/**
 * La fiche : combien on en fait, et ce qu'il faut pour ça.
 *
 * Le gros chiffre est la QUANTITÉ, jamais un nombre de tournées. Dessous, la
 * même chose en vrai. Chaque ingrédient porte son stock — pour voir une erreur
 * — et ce qui manque porte son propre bouton « à faire › », parce que c'est à
 * l'atelier de choisir par où commencer.
 *
 * Cas particulier, la DÉCOUPE : une plaque donne 13 biscuits. Deux chiffres
 * sur le même écran — ce qu'on cuit, ce qu'on coupe — parce que ce sont deux
 * décisions, et qu'aller-retour entre deux écrans pour ça n'a aucun sens.
 */
export function Fiche({ noeud, quantite, onQuantite, cuites, onCuites, faits, onOuvrir, onFait }) {
  const decoupe = onCuites ? decoupeDe(noeud) : null
  const dejaFaits = declares(faits)
  // En découpe, la plaque se fait ICI : elle ne bloque pas, elle est l'écran.
  const bloque = decoupe ? [] : bloquants(noeud, dejaFaits)
  const aPeser = decoupe ? decoupe.enfant : noeud
  const quantitePesee = decoupe ? cuites : quantite

  return (
    <div>
      <div className="flex items-center gap-3">
        <img src={photoDe(noeud.photo || noeud.produit)} alt="" loading="lazy"
          className="w-16 h-16 rounded-2xl object-cover bg-cream-deep shrink-0" />
        <div className="text-[22px] font-extrabold leading-[1.1]">
          {propre(noeud.libelle || noeud.produit)}
        </div>
      </div>

      {decoupe && (
        <div className="mt-5 text-center text-[15px] font-bold text-ink-mute">
          {motPluriel(decoupe.enfant.produit, cuites)} à cuire
        </div>
      )}
      <div className={decoupe ? 'mt-1' : 'mt-5'}>
        <GrosChiffre titre={decoupe ? 'à cuire' : 'à faire'}
          valeur={quantitePesee} unite={aPeser.unite} pas={pasDe(aPeser.unite)}
          onChange={decoupe ? onCuites : onQuantite} />
      </div>
      {!decoupe && (
        <div className="text-center text-[15px] text-ink-mute mt-1">
          {noeud.unite === 'u' ? 'à faire' : `${noeud.unite} à faire`}
        </div>
      )}
      <EnClair noeud={aPeser} quantite={quantitePesee} />

      <Ingredients noeud={aPeser} quantite={quantitePesee}
        dejaFaits={dejaFaits} onOuvrir={onOuvrir} />

      {decoupe && (
        <div className="mt-6 pt-5 border-t-4 border-cream-deep">
          <div className="text-center text-[15px] font-bold text-ink-mute">
            {motPluriel(noeud.produit, quantite)} à couper
          </div>
          <div className="mt-1">
            <GrosChiffre titre="à couper" valeur={quantite} unite={noeud.unite} pas={1}
              onChange={onQuantite} />
          </div>
          <Partage noeud={noeud} decoupe={decoupe} cuites={cuites} coupes={quantite} />
        </div>
      )}

      {/* Éteint tant qu'il manque quelque chose — et tant que le chiffre est
          à zéro : un bouton vert qui ne fait rien est pire qu'un bouton gris. */}
      <button onClick={onFait} disabled={bloque.length > 0 || !(quantite > 0)}
        className={`w-full mt-6 rounded-2xl py-5 text-[20px] font-extrabold
          ${bloque.length || !(quantite > 0) ? 'bg-cream-deep text-ink-mute' : 'bg-success text-cream'}`}>
        C'est fait
      </button>
    </div>
  )
}

/** Le pas du « + » : la pièce, 50 g, un demi-kilo. */
const pasDe = unite => /^kg$/i.test(String(unite || '').trim()) ? 0.5
  : /^(g|gr)$/i.test(String(unite || '').trim()) ? 50 : 1

/**
 * « 4 plaques », « 26 biscuits » — le mot de la chose, accordé.
 *
 * ⚠️ Le mot entre parenthèses prime : « Biscuit a la cuillere (plaque) » EST
 * une plaque, pas un biscuit. Sans ça l'écran annonçait « biscuits à cuire »
 * au-dessus de « biscuits à couper » — les deux chiffres devenaient
 * indiscernables.
 */
const motPluriel = (nom, n) => {
  const m = nomCourt(nom).match(/\b(plaques?|cadres?|biscuits?|tartes?|feuilles?)\b/)
  const base = m ? m[1].replace(/s$/, '') : 'pièce'
  return n > 1 ? base + 's' : base
}

/** Ce que la quantité veut dire en vrai — rien quand il n'y a rien à dire. */
function EnClair({ noeud, quantite }) {
  const dit = enClair(noeud, quantite)
  if (!dit) return null
  return <div className="text-center text-[15px] font-bold text-bordeaux mt-0.5">{dit}</div>
}

/** Ce qu'il faut : ce qui se fabrique d'abord, ce qui se pèse ensuite. */
function Ingredients({ noeud, quantite, dejaFaits, onOuvrir }) {
  const liste = ingredientsPour(noeud, quantite)
  if (!liste.length) return null
  return (
    <div className="mt-5">
      {liste.map((c, i) => {
        const fait = c.dejaFait > 0 || dejaFaits.includes(c.produit)
        const manque = !c.pese && !c.ok && !fait && c.fabrique
        return (
          <div key={c.produit + i}
            className="flex items-center gap-3 py-3 border-t border-cream-deep">
            <span className={`w-3 h-3 rounded shrink-0 ${manque ? 'bg-danger' : 'bg-success'}`} />
            <span className={`flex-1 min-w-0 text-[17px] ${manque ? 'text-danger font-bold' : ''}`}>
              {propre(c.produit)}
              {/* Le stock ne se dit que de ce qui se fabrique : « on peut voir
                  si erreur » (Layla). Le stock des matières premières de
                  l'annexe n'est pas tenu — l'afficher tromperait. */}
              {!c.pese && (
                <span className="block text-[12.5px] text-ink-mute font-normal">
                  {fait ? 'fait à l\'instant' : `en stock ${qte(c.stock, c.unite)}`}
                </span>
              )}
            </span>
            {manque
              ? (
                <button onClick={() => onOuvrir(c.produit)}
                  className="shrink-0 rounded-xl border-2 border-danger text-danger
                             px-3 py-2 text-[14px] font-extrabold">à faire ›</button>
              )
              : <span className="shrink-0 text-[19px] font-extrabold tabular-nums">
                {qte(c.besoin, c.unite)}
              </span>}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Ce que la découpe fait des plaques. Une ligne, trois chiffres — combien il
 * en faut, combien de plaques y passent, combien restent au congélateur.
 */
function Partage({ noeud, decoupe, cuites, coupes }) {
  const p = partageDecoupe({
    cuites, coupes, parPiece: decoupe.parPiece, stock: decoupe.enfant.stock,
  })
  const mot = n => motPluriel(decoupe.enfant.produit, n)
  const besoin = noeud.reste > 0 ? Math.round(noeud.reste) : 0
  const bouts = []
  if (besoin > 0 && besoin !== coupes) bouts.push(`il en faut ${nb(besoin)}`)
  bouts.push(`${nb(p.utilisees)} ${mot(p.utilisees)} ${p.utilisees > 1 ? 'utilisées' : 'utilisée'}`)
  if (p.gardees > 0) bouts.push(`${nb(p.gardees)} ${p.gardees > 1 ? 'gardées' : 'gardée'}`)
  return (
    <div className={`text-center text-[15px] mt-0.5 font-bold
      ${p.manque > 0 ? 'text-danger' : 'text-ink-mute'}`}>
      {p.manque > 0
        ? `il manque ${nb(p.manque)} ${mot(p.manque)}`
        : bouts.join(' · ')}
    </div>
  )
}

/**
 * « Il en est sorti combien ? » — la dernière question, posée UNE fois, au
 * moment où on sait la réponse. Le chiffre proposé est celui qu'on visait :
 * quand rien n'a bougé, c'est un seul appui.
 *
 * Pas de « 200 g de moins que prévu » : le caramel perd à la cuisson, la crème
 * au beurre aussi. Le dire, c'est faire croire à une faute (Layla,
 * 2026-09-10).
 */
export function Sortie({ noeud, valeur, onValeur, onValider, envoi }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <img src={photoDe(noeud.photo || noeud.produit)} alt="" loading="lazy"
          className="w-16 h-16 rounded-2xl object-cover bg-cream-deep shrink-0" />
        <div className="text-[22px] font-extrabold leading-[1.1]">
          {propre(noeud.libelle || noeud.produit)}
        </div>
      </div>

      <div className="text-center text-[19px] font-extrabold mt-8 mb-3">
        Il en est sorti combien ?
      </div>
      <GrosChiffre titre="il en est sorti" valeur={valeur} unite={noeud.unite}
        pas={pasDe(noeud.unite)} onChange={onValeur} />
      {noeud.unite !== 'u' && (
        <div className="text-center text-[15px] text-ink-mute mt-1">{noeud.unite}</div>
      )}

      <button onClick={onValider} disabled={!(valeur > 0) || envoi}
        className={`w-full mt-8 rounded-2xl py-5 text-[20px] font-extrabold
          ${valeur > 0 && !envoi ? 'bg-success text-cream' : 'bg-cream-deep text-ink-mute'}`}>
        {envoi ? 'en cours…' : "C'est bon"}
      </button>
    </div>
  )
}

/** Le fil : « Tiramisu 15 cm › Biscuit cuillère ». Deux mots, pas cinq niveaux. */
export function Fil({ chemin, onRetour }) {
  if (!chemin.length) return null
  return (
    <button onClick={onRetour} className="text-[13px] text-ink-mute font-bold mb-3 text-left">
      ← {chemin.map(propre).join(' › ')}
    </button>
  )
}
