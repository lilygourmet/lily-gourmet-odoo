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
import { enClair, declares, enfantsDe, bloquants, aFaireMaintenant,
  decoupeDe, partageDecoupe, ingredientsPour, nomCourt, photoFabAnnexe,
  quantitePourDose } from '../lib/fabAnnexe'
import { nb, qte, dose, propre, nomAtelier, facteurAtelier,
  enGrammes, enUnite, uniteAffichee } from '../lib/ecranSimple'

/** La photo d'un article, servie par Odoo. */
const photoDe = photoFabAnnexe

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
    // ⚠️ Sur tablette, tout est plus petit d'un cran : « c'est trop grand »
    // (Layla, 2026-09-11). Le téléphone, lui, garde ses gros doigts.
    <div className="grid gap-3 md:gap-2.5
                    grid-cols-[repeat(auto-fill,minmax(150px,1fr))]
                    md:grid-cols-[repeat(auto-fill,minmax(124px,1fr))]">
      {liste.map(a => (
        <button key={a.produit} onClick={() => onOuvrir(a.produit)}
          className="text-left rounded-2xl border border-cream-deep bg-cream-warm overflow-hidden
                     shadow-sm active:scale-[0.98] transition-transform">
          <div className="relative">
            <img src={photoDe(a.photo || a.produit)} alt="" loading="lazy"
              className="w-full aspect-square object-cover bg-cream-deep" />
            {/* ⚠️ INTROUVABLE DANS ODOO : l'article a été renommé là-bas et le
                catalogue garde l'ancien nom. Sans ce « ? », il s'affichait avec
                une pastille « 1 » — un travail à faire qui n'existe pas
                (Layla, 2026-09-11). */}
            <span className={`absolute left-2 top-2 rounded-full text-cream
                             px-3 py-1 text-[19px] font-extrabold tabular-nums
                             md:px-2.5 md:py-0.5 md:text-[16px]
                             ${a.absent ? 'bg-ink-mute' : 'bg-danger'}`}>
              {a.absent ? '?' : nb(enGrammes(aFaireMaintenant(a), a.unite))}
            </span>
          </div>
          <div className="px-3 py-2 md:px-2.5 md:py-1.5">
            <div className="text-[16px] font-bold leading-tight md:text-[14px]">
              {propre(a.libelle || a.produit)}
            </div>
            {a.absent && (
              <div className="text-[12.5px] text-danger font-bold mt-0.5">
                introuvable dans Odoo — renommé ?
              </div>
            )}
            {/* Le besoin total sous le nom, quand une fournée n'y suffit pas :
                la pastille dit quoi faire maintenant, cette ligne dit pourquoi. */}
            {!a.absent && a.reste > aFaireMaintenant(a) && (
              <div className="text-[12.5px] text-ink-mute mt-0.5">
                il en faut {qte(a.reste, a.unite)}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

/**
 * Les deux onglets. « À faire » montre le travail du jour ; « Déclarer » sert
 * à venir dire ce qu'on a fabriqué, même un article qui n'était pas demandé.
 * Deux gros boutons, deux mots — rien de plus.
 */
export function Onglets({ onglet, onChange }) {
  return (
    <div className="flex gap-2 mb-4">
      {[['faire', 'À faire'], ['declarer', 'Déclarer']].map(([k, t]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`flex-1 rounded-2xl py-4 text-[17px] font-extrabold border-2
            ${onglet === k ? 'bg-bordeaux border-bordeaux text-cream'
                           : 'bg-cream-warm border-cream-deep text-ink-mute'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

/**
 * Des cases photo + nom, sans chiffre : on choisit un gâteau, puis sa taille.
 * Pas de pastille rouge ici — dans « Déclarer », rien n'est en retard, on
 * vient juste dire ce qu'on a fait.
 */
export function Cases({ items, onOuvrir, vide }) {
  if (!items?.length) {
    return <p className="text-center text-[17px] font-bold text-ink-mute py-16">{vide}</p>
  }
  return (
    <div className="grid gap-3 md:gap-2.5
                    grid-cols-[repeat(auto-fill,minmax(150px,1fr))]
                    md:grid-cols-[repeat(auto-fill,minmax(124px,1fr))]">
      {items.map(it => (
        <button key={it.cle} onClick={() => onOuvrir(it.cle)}
          className="text-left rounded-2xl border border-cream-deep bg-cream-warm overflow-hidden
                     shadow-sm active:scale-[0.98] transition-transform">
          <img src={photoDe(it.photo || it.cle)} alt="" loading="lazy"
            className="w-full aspect-square object-cover bg-cream-deep" />
          <div className="px-3 py-2 text-[16px] font-bold leading-tight md:px-2.5 md:py-1.5 md:text-[14px]">
            {propre(it.libelle || it.cle)}
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
 *
 * ⚠️ TOUT s'affiche et se tape en GRAMMES (Layla, 2026-09-11). `valeur` et
 * `onChange`, eux, parlent l'unité de l'ARTICLE — c'est elle qui part chez
 * Odoo. La conversion ne vit qu'ici, via `enGrammes` / `enUnite`.
 */
export function GrosChiffre({ titre, valeur, unite, onChange, pas: impose, verrouille, onLiberer }) {
  const [clavier, setClavier] = useState(false)
  const vu = enGrammes(valeur, unite)
  // Le pas par défaut : la pièce, ou 50 g. Une DÉCOUPE impose le sien — on ne
  // coupe pas un sixième de plaque (Layla, 2026-09-11).
  const pas = impose || (/^u$/i.test(String(unite || '').trim()) ? 1 : 50)
  const bouger = d => onChange(enUnite(Math.max(0, Math.round((vu + d) * 1000) / 1000), unite))
  // VERROUILLÉ : le chiffre a été décidé, le travail est lancé, la recette a
  // été suivie pour LUI. On ne peut plus le baisser par réflexe à la fin —
  // sinon la crème se recalculerait pour un compte qu'on n'a pas préparé.
  // « Ça reste toujours 25 ; si on change d'avis, Réinitialiser » (Layla).
  if (verrouille) {
    return (
      <div className="text-center">
        <div className="font-extrabold tabular-nums text-[54px] leading-none
                        md:text-[42px] print:text-[24pt]">{nb(vu)}</div>
        {onLiberer && (
          <button onClick={onLiberer}
            className="print:hidden mt-1 text-[13px] font-bold text-ink-mute underline
                       decoration-dotted underline-offset-4">
            réinitialiser
          </button>
        )}
      </div>
    )
  }
  return (
    <>
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => bouger(-pas)}
          disabled={vu <= 0} aria-label={`Moins ${titre}`}
          className="print:hidden w-16 h-16 rounded-3xl border-2 border-cream-deep bg-cream-warm
                     text-[34px] font-extrabold text-bordeaux leading-none disabled:opacity-30
                     md:w-14 md:h-14 md:text-[28px]">−</button>
        <button onClick={() => setClavier(true)} aria-label={`Changer ${titre}`}
          className="min-w-[130px] text-center font-extrabold tabular-nums text-[54px] leading-none
                     md:min-w-[110px] md:text-[42px] print:text-[24pt] print:min-w-0">
          {nb(vu)}
        </button>
        <button onClick={() => bouger(pas)} aria-label={`Plus ${titre}`}
          className="print:hidden w-16 h-16 rounded-3xl border-2 border-cream-deep bg-cream-warm
                     text-[34px] font-extrabold text-bordeaux leading-none
                     md:w-14 md:h-14 md:text-[28px]">+</button>
      </div>
      {/* « Réinitialiser » se voit AUSSI quand le chiffre n'est pas encore
          verrouillé : dès qu'il est retenu pour la journée, on doit pouvoir
          le rendre à l'app. « Je ne vois plus le bouton Réinitialiser »
          (Layla, 2026-09-11). */}
      {onLiberer && (
        <div className="text-center">
          <button onClick={onLiberer}
            className="print:hidden mt-1 text-[13px] font-bold text-ink-mute underline
                       decoration-dotted underline-offset-4">
            réinitialiser
          </button>
        </div>
      )}
      {clavier && (
        <Clavier titre={titre} valeur={Math.round(vu * 1000) / 1000} unite={uniteAffichee(unite)}
          onValider={v => { onChange(enUnite(v, unite)); setClavier(false) }}
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
export function Fiche({ noeud, quantite, onQuantite, cuites, onCuites, faits, onOuvrir, onFait, envoi,
  verrouille, onLiberer }) {
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
          className="w-16 h-16 rounded-2xl object-cover bg-cream-deep shrink-0
                     md:w-14 md:h-14 print:w-12 print:h-12" />
        <div className="text-[22px] font-extrabold leading-[1.1] md:text-[19px] print:text-[15pt]">
          {propre(noeud.libelle || noeud.produit)}
        </div>
      </div>

      {decoupe && (
        <div className="mt-5 text-center text-[15px] font-bold text-ink-mute print:mt-2 print:text-[10pt]">
          {titreDuHaut(decoupe.enfant, cuites)}
        </div>
      )}
      <div className={decoupe ? 'mt-1' : 'mt-5'}>
        {/* Le « + » avance d'UNE PLAQUE quand la chose se compte en plaques :
            sauter de 50 g dans une plaque de 3 040 n'a aucun sens. */}
        <GrosChiffre titre={decoupe ? 'à cuire' : 'à faire'}
          valeur={quantitePesee} unite={aPeser.unite}
          pas={decoupe ? dosePourUnePlaque(noeud) || undefined : undefined}
          verrouille={decoupe ? false : verrouille} onLiberer={onLiberer}
          onChange={decoupe ? onCuites : onQuantite} />
      </div>
      {!decoupe && (
        <div className="text-center text-[15px] text-ink-mute mt-1 print:text-[10pt]">
          {/^u$/i.test(String(noeud.unite || '').trim())
            ? 'à faire' : `${uniteAffichee(noeud.unite)} à faire`}
        </div>
      )}
      {decoupe && <EnPlaques noeud={noeud} decoupe={decoupe} cuites={cuites} onCuites={onCuites} />}
      {/* Rien à cuire : c'est déjà au frigo. On le DIT, au lieu de laisser un
          zéro tout seul — et rien ne sera déclaré comme fabriqué.
          (Layla, 2026-09-11 : « si le produit est déjà en stock, il ne
          considère pas qu'il l'a préparé ».) */}
      {decoupe && !(cuites > 0) && (
        <div className="text-center text-[15px] font-bold text-success mt-0.5">
          tu en as déjà — {qte(decoupe.enfant.stock, decoupe.enfant.unite)}
        </div>
      )}
      <EnClair noeud={aPeser} quantite={quantitePesee} />

      <Ingredients noeud={aPeser} quantite={quantitePesee}
        dejaFaits={dejaFaits} onOuvrir={onOuvrir}
        onQuantite={decoupe ? onCuites : onQuantite} />

      <QuantiteFigee noeud={aPeser} quantite={quantitePesee} />

      {!decoupe && <PourUn noeud={noeud} quantite={quantite} />}

      {decoupe && (
        <div className="mt-6 pt-5 border-t-4 border-cream-deep">
          <div className="text-center text-[15px] font-bold text-ink-mute print:text-[10pt]">
            {enPieces(decoupe.enfant.unite)
              ? `${motPluriel(noeud.produit, quantite)} à couper` : 'à faire'}
          </div>
          <div className="mt-1">
            {/* ⚠️ Par PALIER de ce que donne une plaque : « si les plaques se
                coupent par 6, c'est toujours par palier de 6 » (Layla,
                2026-09-11). Le clavier, lui, accepte n'importe quel nombre —
                « je fais 4 plaques et je décide d'en couper 26 ». */}
            <GrosChiffre titre="à couper" valeur={quantite} unite={noeud.unite}
              pas={palierDeCoupe(decoupe, noeud)} verrouille={verrouille} onLiberer={onLiberer}
              onChange={onQuantite} />
          </div>
          <Partage noeud={noeud} decoupe={decoupe} cuites={cuites} coupes={quantite} />
        </div>
      )}

      {/* Éteint tant qu'il manque quelque chose — et tant que le chiffre est
          à zéro : un bouton vert qui ne fait rien est pire qu'un bouton gris.
          ⚠️ Et il RÉPOND AU DOIGT : créer l'ordre chez Odoo prend plusieurs
          secondes, pendant lesquelles il faut VOIR qu'il se passe quelque
          chose — sinon on appuie deux fois. « Je dois double-cliquer pour
          réaliser que c'est fait » (Layla, 2026-09-11). */}
      <button onClick={onFait} disabled={bloque.length > 0 || !(quantite > 0) || envoi}
        className={`print:hidden w-full mt-6 rounded-2xl py-5 text-[20px] font-extrabold transition-colors
          md:mt-5 md:py-4 md:text-[18px]
          ${envoi ? 'bg-bordeaux text-cream'
            : bloque.length || !(quantite > 0) ? 'bg-cream-deep text-ink-mute'
            : 'bg-success text-cream'}`}>
        {envoi ? 'en cours…' : "C'est fait"}
      </button>
    </div>
  )
}

/**
 * De combien en combien on coupe : ce qu'UNE plaque donne, toujours.
 *
 * « Quand on coupe une plaque, c'est toujours le nombre total possible par
 * plaque : si je coupe des individuels c'est 102 à chaque découpe et pas
 * moins » (Layla, 2026-09-11). On coupe une plaque entière, ou rien.
 *
 * C'est donc la SORTIE de la recette qui donne le pas — 102 individuels,
 * 6 dix-personnes, 13 cinq-personnes — que la plaque se compte en pièces ou
 * en grammes. Zéro reste possible : la plaque part alors entière au congélo.
 */
const palierDeCoupe = (decoupe, noeud) => {
  const n = Math.round(Number(noeud?.tourneeTaille) || 0)
  return n >= 2 ? n : 1
}

/**
 * CE QUE PÈSE UNE PLAQUE : la dose qu'une découpe consomme d'un coup.
 *
 * « Le biscuit c'est 3 600 g par tournée, pas moins » (Layla, 2026-09-11) : on
 * ne cuit pas un demi-biscuit. Le « + » du poids à cuire avance donc d'une
 * plaque entière — 3 600 g de plaque gianduja, 3 040 g de plaque brownie,
 * une plaque de biscuit cuillère.
 *
 * ⚠️ Pas la fournée de la plaque : celle du brownie en sort DEUX d'un coup
 * (6 080 g), et avancer par deux interdirait d'en cuire trois.
 */
const dosePourUnePlaque = noeud => Number((noeud?.recette || [])[0]?.qty) || 0

/** Ce qui se compte à la pièce — par opposition à ce qui se pèse. */
const enPieces = u => /^u$/i.test(String(u || '').trim())

/**
 * Ce qu'on écrit au-dessus du premier chiffre d'une découpe.
 *
 * Quand l'ingrédient se compte en plaques, on dit le geste : « 4 plaques à
 * cuire ». Quand il se pèse, on dit la CHOSE : « sablé crispy » — parce que
 * « 2 900 pièces à cuire » ne voudrait rien dire, et que ce qu'il faut savoir
 * c'est quoi préparer.
 */
const titreDuHaut = (enfant, combien) => (enPieces(enfant.unite)
  ? `${motPluriel(enfant.produit, combien)} à cuire`
  : propre(nomCourt(enfant.produit)))

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

/**
 * Combien pèse UNE plaque : la dose qu'il faut pour une fournée de l'article.
 * Rend 0 quand on ne peut pas le dire — l'ingrédient se compte déjà en
 * plaques, ou son nom ne dit pas « plaque ».
 */
const grammesParPlaque = (noeud, decoupe) => {
  const nom = decoupe?.enfant?.produit || ''
  if (enPieces(decoupe?.enfant?.unite) || !/plaque|cadre/i.test(nom)) return 0
  return Number((noeud?.recette || [])[0]?.qty) || 0
}

/**
 * « 3 040 g = 1 plaque » — ce que le poids veut dire sur la table.
 *
 * Un pâtissier ne verse pas 3 040 g, il étale UNE plaque. On ne le dit que
 * quand le mot est sûr — l'ingrédient s'appelle « plaque » ou « cadre » —
 * parce qu'écrire « 2 400 g = 1 biscuit » n'aiderait personne.
 * (Layla, 2026-09-11 : « explique que par exemple royal chocolat
 * 3 040 = 1 plaque ».)
 */
function EnPlaques({ noeud, decoupe, cuites, onCuites }) {
  const [clavier, setClavier] = useState(false)
  const parPlaque = grammesParPlaque(noeud, decoupe)
  if (!(parPlaque > 0) || !(cuites > 0)) return null
  const n = Math.round((cuites / parPlaque) * 100) / 100
  const mot = /cadre/i.test(decoupe.enfant.produit) ? 'cadre' : 'plaque'
  return (
    <>
      {/* On peut aussi ÉCRIRE le nombre de plaques : « donne-moi la
          possibilité d'écrire 2 plaques ou 3 plaques si je veux » (Layla,
          2026-09-11). L'app repasse en grammes toute seule. */}
      <button onClick={() => setClavier(true)} aria-label={`Changer le nombre de ${mot}s`}
        className="print:hidden block mx-auto text-center text-[15px] font-bold
                   text-bordeaux mt-0.5 underline decoration-dotted underline-offset-4">
        = {nb(n)} {n > 1 ? mot + 's' : mot}
      </button>
      {clavier && (
        <Clavier titre={`${mot}s à cuire`} valeur={n} unite=""
          onValider={v => { onCuites(v * parPlaque); setClavier(false) }}
          onFermer={() => setClavier(false)} />
      )}
    </>
  )
}

/** Ce que la quantité veut dire en vrai — rien quand il n'y a rien à dire. */
function EnClair({ noeud, quantite }) {
  const dit = enClair(noeud, quantite)
  if (!dit) return null
  return <div className="text-center text-[15px] font-bold text-bordeaux mt-0.5 print:text-[10pt]">{dit}</div>
}

/**
 * Ce qu'il faut : ce qui se fabrique d'abord, ce qui se pèse ensuite.
 *
 * Deux gestes par ligne, deux zones :
 *   • le NOM, à gauche → ouvre l'ingrédient. Tout ce qui se fabrique s'ouvre,
 *     même en stock : « je peux rajouter quelque chose de la recette même si
 *     déjà en stock » (Layla, 2026-09-10).
 *   • la DOSE, à droite → le clavier. La retaper remet TOUTE la recette à
 *     l'échelle : 1,5 kg de sucre là où elle en veut 1,2, c'est une recette et
 *     demie (choix A de Layla).
 *
 * ⚠️ Les quantités FIGÉES n'y sont pas : elles ont leur bloc à part, parce
 * qu'elles ne suivent pas la sortie réelle.
 */
function Ingredients({ noeud, quantite, dejaFaits, onOuvrir, onQuantite }) {
  const [dose, setDose] = useState(null)
  const liste = ingredientsPour(noeud, quantite).filter(c => !(c.fige && !c.fabrique))
  if (!liste.length) return null
  const enPieces = /^u$/i.test(String(noeud?.unite || '').trim())
  return (
    <div className="mt-5">
      {liste.map((c, i) => {
        const fait = c.dejaFait > 0 || dejaFaits.includes(c.produit)
        const manque = !c.pese && !c.ok && !fait && c.fabrique
        const nom = nomAtelier(c.produit)
        const combien = qte(c.besoin * facteurAtelier(c.produit), c.unite)
        return (
          <div key={c.produit + i}
            className="flex items-center gap-2 py-3 border-t border-cream-deep">
            <button onClick={() => c.fabrique && onOuvrir(c.produit)}
              className="flex-1 min-w-0 text-left flex items-center gap-3">
              <span className={`w-3 h-3 rounded shrink-0 ${manque ? 'bg-danger' : 'bg-success'}`} />
              <span className={`flex-1 min-w-0 text-[17px] md:text-[15px] print:text-[11pt]
                ${manque ? 'text-danger font-bold' : ''}`}>
                {/* ⚠️ « Masse gélatine », pas « Gélatine en poudre » : l'atelier
                    pèse la masse (poudre + 6 fois son eau), Odoo compte la
                    poudre. Sans cette règle, on pèse SEPT FOIS trop peu. */}
                {nom}
                {/* Le stock ne se dit que de ce qui se FABRIQUE : « on peut voir
                    si erreur » (Layla). Celui des matières premières n'est pas
                    tenu à l'annexe — 47 tonnes de sucre, une gélatine à
                    −7 590 g : l'afficher ne ferait que semer le doute. */}
                {c.fabrique && (
                  <span className="flex items-baseline gap-2 text-[12.5px] font-normal print:text-[8pt]">
                    <span className={`flex-1 min-w-0 truncate ${manque ? 'text-danger' : 'text-ink-mute'}`}>
                      {fait ? 'fait à l\'instant' : `en stock ${qte(c.stock, c.unite)}`}
                    </span>
                    <span className={`shrink-0 font-bold print:hidden ${manque ? 'text-danger' : 'text-ink-mute'}`}>
                      {manque ? 'à faire ›' : 'en faire ›'}
                    </span>
                  </span>
                )}
              </span>
            </button>
            {/* La dose, qu'on peut retaper — le nombre reste gros et lisible. */}
            <button onClick={() => setDose({ ...c, nom, combien })}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-[19px] font-extrabold tabular-nums
                md:text-[17px] print:text-[12pt] print:px-0 print:py-0 print:border-0
                ${manque ? 'border-2 border-danger text-danger' : ''}`}>
              {combien}
            </button>
          </div>
        )
      })}
      {dose && (
        <Clavier titre={dose.nom} unite={/^kg$/i.test(String(dose.unite || '').trim()) ? 'g' : dose.unite}
          valeur={Math.round(nombreDe(dose.combien))}
          onFermer={() => setDose(null)}
          onValider={v => {
            onQuantite(quantitePourDose({
              quantite, besoin: dose.besoin, saisi: v, unite: dose.unite,
              facteur: facteurAtelier(dose.produit), enPieces,
            }))
            setDose(null)
          }} />
      )}
    </div>
  )
}

/** « 1 900 g » → 1900. Le clavier part du nombre affiché, pas de son texte. */
const nombreDe = txt => Number(String(txt).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0

/**
 * LES QUANTITÉS FIGÉES : la cuve. Elle part en entier sur la fournée et ne
 * bouge pas avec la sortie réelle — d'où son bloc à part, sous son nom
 * (« La mousse », « La crème citron »).
 */
export function QuantiteFigee({ noeud, quantite }) {
  const figes = ingredientsPour(noeud, quantite).filter(c => c.fige && !c.fabrique)
  if (!figes.length) return null
  return (
    <div className="mt-6 rounded-2xl border-2 border-cream-deep overflow-hidden
                    print:mt-3 print:break-inside-avoid">
      <div className="px-4 py-2.5 bg-cream-deep/40 print:py-1">
        <div className="text-[16px] font-extrabold">{noeud.figesNom || 'La cuve'}</div>
        <div className="text-[12.5px] text-ink-mute mt-0.5">
          Pour la fournée entière — ne bouge pas avec ce qui sort vraiment
        </div>
      </div>
      {figes.map((c, i) => (
        <div key={c.produit + i}
          className="flex items-baseline gap-3 px-4 py-2.5 border-t border-cream-deep/40 print:py-0.5">
          <span className="flex-1 min-w-0 text-[16px] print:text-[10pt]">{nomAtelier(c.produit)}</span>
          <span className="shrink-0 text-[19px] font-extrabold tabular-nums print:text-[11pt]">
            {qte(c.besoin * facteurAtelier(c.produit), c.unite)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Ce qu'une pièce prend d'un ingrédient. En grammes, sauf quand la pièce prend
 * moins d'UNE unité : un cadre de forêt noire ne prend pas « 0,09 biscuit »,
 * il en faut « 1 pour 11 » — c'est la même phrase que l'ancien écran, et c'est
 * ce que dit un pâtissier.
 */
const parPiece = (v, unite) => {
  const n = Number(v) || 0
  return /^u$/i.test(String(unite || '').trim()) && n > 0 && n < 1
    ? `1 pour ${nb(Math.round(1 / n))}`
    : dose(n, unite)
}

/**
 * Le mot de l'atelier, dans la recette du bas : une mousse s'appelle
 * « Mousse », qu'Odoo l'ait baptisée « Mousse Gianduja », « La mousse » ou
 * « SM. Mousse cheese passion ». « Si y a mousse, l'appeler mousse » (Layla,
 * 2026-09-11) — celle qui monte le gâteau sait de quelle mousse il s'agit,
 * c'est la sienne.
 *
 * Ne vaut QUE pour ce bloc-là : la liste du haut et le bloc des quantités
 * figées gardent les vrais noms, ce sont eux qu'on va chercher au frigo.
 */
const motDeLAtelier = nom => (/mousse/i.test(String(nom || '')) ? 'Mousse' : nom)

/**
 * LA PESÉE DU MONTAGE : ce qu'on met sur UN gâteau.
 *
 * Le total dit ce qu'on sort du frigo ; celui-ci dit le geste — « 38 g de
 * glaçage sur chaque individuel ». C'est le tableau « Pour 1 … » de l'ancien
 * écran, que Layla a réclamé le 2026-09-11.
 *
 * Ne s'affiche que pour un MONTAGE compté en pièces : « pour 1 » d'un caramel
 * pesé en grammes ne veut rien dire, et une pâte à plaque ne se dose pas à la
 * pièce. Et jamais pour une seule pièce : la liste du dessus le dit déjà.
 *
 * ⚠️ La CUVE ne fait qu'une ligne, sous son nom : « la mousse du royal, ce
 * n'est pas lait 149 g, gélatine 9 g, crème 447 g — c'est La mousse, 800 g »
 * (Layla, 2026-09-10).
 */
export function PourUn({ noeud, quantite }) {
  const enPieces = /^u$/i.test(String(noeud?.unite || '').trim())
  const montage = enfantsDe(noeud).some(c => c.fabrique)
  if (!enPieces || !montage || !(quantite > 1)) return null
  const liste = ingredientsPour(noeud, quantite)
  const cuve = liste.filter(c => c.fige && !c.fabrique)
  const lignes = liste.filter(c => !(c.fige && !c.fabrique))
    .map(c => ({
      nom: motDeLAtelier(nomAtelier(c.produit)),
      valeur: parPiece(c.besoin * facteurAtelier(c.produit) / quantite, c.unite),
    }))
  if (cuve.length) {
    // Une cuve ne se pèse qu'en grammes : c'est la seule unité commune à ses
    // ingrédients, et c'est celle de la balance.
    const g = cuve.reduce((t, c) =>
      t + (Number(c.besoin) || 0) * (/^kg$/i.test(String(c.unite || '').trim()) ? 1000 : 1), 0)
    lignes.push({
      nom: motDeLAtelier(noeud.figesNom || 'La cuve'),
      valeur: dose(g / quantite, 'g'),
    })
  }
  if (!lignes.length) return null
  // Plus petit et en italique que le reste : c'est un RAPPEL, pas le geste du
  // moment — le geste, c'est la liste du haut. (Layla, 2026-09-11.)
  return (
    <div className="mt-6 rounded-2xl border border-cream-deep bg-cream-warm overflow-hidden italic
                    print:mt-3 print:break-inside-avoid">
      <div className="px-3.5 py-2 text-[12.5px] font-bold text-ink-mute border-b border-cream-deep
                      print:py-1 print:text-[9pt]">
        Pour 1 {propre(noeud.libelle || noeud.produit)}
      </div>
      {lignes.map((l, i) => (
        <div key={l.nom + i}
          className="flex items-baseline gap-3 px-3.5 py-1.5 border-t border-cream-deep/40
                     first:border-t-0 print:py-0.5">
          <span className="flex-1 min-w-0 text-[13px] print:text-[9pt]">{l.nom}</span>
          <span className="shrink-0 text-[14px] font-bold tabular-nums print:text-[10pt]">{l.valeur}</span>
        </div>
      ))}
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
  // Des plaques se comptent (« 2 plaques »), un sablé se pèse (« 2 900 g »).
  const dire = v => (enPieces(decoupe.enfant.unite)
    ? `${nb(v)} ${motPluriel(decoupe.enfant.produit, v)}`
    : qte(v, decoupe.enfant.unite))
  // « 2 plaques utilisées », « 2 900 g utilisés » : le mot s'accorde avec la
  // chose. L'écran est lu par des gens qui butent sur les mots — on ne va pas
  // leur écrire de travers.
  const fin = v => (/^(plaques?|tartes?|feuilles?)$/i.test(
    enPieces(decoupe.enfant.unite) ? motPluriel(decoupe.enfant.produit, v) : 'g') ? 'e' : '')
    + (v > 1 ? 's' : '')
  const besoin = noeud.reste > 0 ? Math.round(noeud.reste) : 0
  const bouts = []
  if (besoin > 0 && besoin !== coupes) bouts.push(`il en faut ${nb(besoin)}`)
  bouts.push(`${dire(p.utilisees)} utilisé${fin(p.utilisees)}`)
  if (p.gardees > 0) bouts.push(`${dire(p.gardees)} gardé${fin(p.gardees)}`)
  return (
    <div className={`text-center text-[15px] mt-0.5 font-bold
      ${p.manque > 0 ? 'text-danger' : 'text-ink-mute'}`}>
      {p.manque > 0 ? `il manque ${dire(p.manque)}` : bouts.join(' · ')}
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
/**
 * ⚠️ Plus de récapitulatif des ingrédients ici : « enlève les recettes en bas,
 * ça remplit juste la page » (Layla, 2026-09-11). À ce moment-là le travail est
 * fait — la recette a servi sur l'écran d'avant. Ce qui sort du stock continue
 * d'être calculé et imposé à l'ordre Odoo, mais sans encombrer l'écran.
 */
export function Sortie({ noeud, valeur, onValeur, onValider, envoi, tailles, nomCuve, parTaille, onTaille, prevu }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <img src={photoDe(noeud.photo || noeud.produit)} alt="" loading="lazy"
          className="w-16 h-16 rounded-2xl object-cover bg-cream-deep shrink-0" />
        <div className="text-[22px] font-extrabold leading-[1.1]">
          {propre(noeud.libelle || noeud.produit)}
        </div>
      </div>

      {/* ⚠️ On RAPPELLE le prévu, et on dit que la crème ne bouge pas : baisser
          le nombre de gâteaux ne rend pas de crème au frigo, elle a été faite.
          C'est la confusion que Layla a signalée le 2026-09-11. */}
      {prevu > 0 && (
        <div className="text-center text-[15px] text-ink-mute mt-8">
          Tu en avais prévu <b className="text-ink">{nb(prevu)}</b>
        </div>
      )}
      <div className={`text-center text-[19px] font-extrabold mb-3 ${prevu > 0 ? 'mt-1' : 'mt-8'}`}>
        Il en est sorti combien ?
      </div>
      <GrosChiffre titre="il en est sorti" valeur={valeur} unite={noeud.unite}
        onChange={onValeur} />
      {!/^u$/i.test(String(noeud.unite || '').trim()) && (
        <div className="text-center text-[15px] text-ink-mute mt-1">{uniteAffichee(noeud.unite)}</div>
      )}
      {prevu > 0 && valeur !== prevu && (
        <div className="text-center text-[14px] font-bold text-bordeaux mt-1">
          la recette reste comptée pour {nb(prevu)} — tu l'as faite
        </div>
      )}

      {onTaille && (
        <AutresTailles tailles={tailles} nomCuve={nomCuve}
          valeurs={parTaille} onChange={onTaille} />
      )}

      <button onClick={onValider} disabled={!(valeur > 0) || envoi}
        className={`w-full mt-8 rounded-2xl py-5 text-[20px] font-extrabold
          ${valeur > 0 && !envoi ? 'bg-success text-cream' : 'bg-cream-deep text-ink-mute'}`}>
        {envoi ? 'en cours…' : "C'est bon"}
      </button>
    </div>
  )
}

/**
 * LES AUTRES TAILLES faites avec la même cuve.
 *
 * Une cuve ne se divise pas : on monte des 23 cm, et ce qui reste finit en
 * 18 cm et en individuels. Sans cette question, tout le poids de la crème
 * partait sur la seule taille déclarée. (Layla, 2026-09-11.)
 *
 * Seules les tailles PLUS PETITES sont proposées — c'est là qu'on finit une
 * cuve, jamais l'inverse.
 */
export function AutresTailles({ tailles, nomCuve, valeurs, onChange }) {
  const [clavier, setClavier] = useState(null)
  if (!tailles?.length) return null
  return (
    <div className="mt-7 rounded-2xl border-2 border-cream-deep overflow-hidden text-left">
      <div className="px-4 py-2.5 bg-cream-deep/40 text-[15px] font-bold">
        Tu en as fait d'autres tailles avec {nomCuve ? `« ${nomCuve} »` : 'la même cuve'} ?
      </div>
      {tailles.map(t => {
        const v = Number(valeurs?.[t.produit]) || 0
        return (
          <div key={t.produit}
            className="flex items-center gap-2 px-4 py-2.5 border-t border-cream-deep/40 md:py-2">
            <span className="flex-1 min-w-0 text-[16px] md:text-[15px]">
              {propre(t.libelle || t.produit)}
            </span>
            <button onClick={() => onChange(t.produit, Math.max(0, v - 1))} disabled={v <= 0}
              aria-label={`Moins ${propre(t.libelle || t.produit)}`}
              className="w-11 h-11 rounded-xl border-2 border-cream-deep bg-cream-warm
                         text-[24px] font-extrabold text-bordeaux leading-none disabled:opacity-30">−</button>
            <button onClick={() => setClavier(t)} aria-label={`Changer ${propre(t.libelle || t.produit)}`}
              className="min-w-[56px] text-center text-[24px] font-extrabold tabular-nums">{nb(v)}</button>
            <button onClick={() => onChange(t.produit, v + 1)}
              aria-label={`Plus ${propre(t.libelle || t.produit)}`}
              className="w-11 h-11 rounded-xl border-2 border-cream-deep bg-cream-warm
                         text-[24px] font-extrabold text-bordeaux leading-none">+</button>
          </div>
        )
      })}
      {clavier && (
        <Clavier titre={propre(clavier.libelle || clavier.produit)} unite="u"
          valeur={Number(valeurs?.[clavier.produit]) || 0}
          onValider={v => { onChange(clavier.produit, Math.max(0, Math.round(v))); setClavier(null) }}
          onFermer={() => setClavier(null)} />
      )}
    </div>
  )
}

/**
 * LA CONFIRMATION — plein écran, vert, une seconde et demie.
 *
 * « Montre clairement quand je clique sur le bouton c'est fait : je dois
 * double-cliquer pour réaliser que c'est fait » (Layla, 2026-09-11). Un petit
 * message en bas d'écran se rate, surtout les mains dans la farine. Celle-ci
 * ne se rate pas, et elle s'efface toute seule — rien à refermer.
 */
export function Confirmation({ quoi, combien }) {
  return (
    <div className="print:hidden fixed inset-0 z-[80] bg-success/95 text-cream flex flex-col
                    items-center justify-center gap-4 px-8 text-center">
      <div className="text-[86px] leading-none">✓</div>
      <div className="text-[26px] font-extrabold leading-tight">C'est noté</div>
      <div className="text-[19px] font-bold opacity-90">{quoi}</div>
      {combien && <div className="text-[22px] font-extrabold tabular-nums">{combien}</div>}
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
