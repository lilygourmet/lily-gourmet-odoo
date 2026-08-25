import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { loadFabrication, loadFaits, setFait, loadManques, validerDansOdoo , dernierEcran, garderEcran, reserverOrdres , creerOfPrepa, annulerOfPrepa } from '../lib/fabrication'
import { canValiderOf } from '../lib/auth'
import { toast } from '../lib/toast'
import { supabase } from '../lib/supabase'

// ====== « Ce matin » : ce qu'il y a à fabriquer en cakedesign ======
// Déroulé pensé pour la personne qui arrive le matin (validé avec Layla) :
//   1. les BASES à préparer (crème au beurre nature, craquant, sirop) — si besoin
//   2. les GÂTEAUX à faire, séparés « pour le stock » / « pour une commande »,
//      groupés par parfum ; elle coche ceux qu'elle veut faire
//   3. la RECETTE cumulée pour tous les gâteaux cochés ; ouvrir une ligne montre
//      ses sous-catégories (la recette de la préparation, à la bonne quantité)
// La recette est à droite sur ordinateur, en page séparée sur téléphone.

const BASES = [/cr[eè]me au beurre nature/i, /craquant/i, /sirop/i, /amandes\s*caram/i]
const CASA = { timeZone: 'Africa/Casablanca' }   // Odoo renvoie de l'UTC

const dt = q => new Date(String(q || '').replace(' ', 'T') + 'Z')
const jourCourt = q => dt(q).toLocaleDateString('fr-FR', { ...CASA, day: '2-digit', month: '2-digit' })
const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
// Layla veut tout en grammes, jamais en kilos (sauf les pièces : ×8 gâteaux).
const qteLisible = (q, u) => (norm(u) === 'kg' ? `${nb(q * 1000)} g` : `${nb(q)} ${u}`)
const norm = u => String(u || '').toLowerCase().replace(/^units?$/, 'u')
const enKg = (q, u) => (norm(u) === 'g' ? { q: q / 1000, u: 'kg' } : { q, u: norm(u) })
const estPrepa = n => /^SM\b/i.test(String(n || ''))
// Suivi « fait » : un gâteau se suit par son ordre Odoo, une préparation par son
// nom + le jour (elle se refait chaque jour).
const aujourdhui = () => new Date().toLocaleDateString('sv-SE', CASA)
const clePrepa = produit => `PREP:${produit}:${aujourdhui()}`
// « Crème au beurre Chocolat STK » et « Crème au beurre Chocolat » sont la MÊME
// crème (deux articles Odoo) : on les rassemble, stocks compris.
// Sert UNIQUEMENT à regrouper les gâteaux (« Crème au beurre Chocolat » et
// « … Chocolat STK » = même famille) ; les quantités et les stocks des deux
// articles ne sont jamais melangés.
const sansStk = n => String(n || '').replace(/\s*\bSTK\b/i, '').trim()
// Les recettes sont toujours affichées dans cet ordre, quel que soit le gâteau.
const ORDRE = [/genoise/i, /sirop/i, /cr[eè]me/i, /craquant/i, /amandes/i]
const rang = n => { const i = ORDRE.findIndex(r => r.test(String(n || ''))); return i < 0 ? ORDRE.length : i }
const trierRecette = arr => arr.slice().sort((a, b) => rang(a.produit) - rang(b.produit) || String(a.produit).localeCompare(String(b.produit)))
const estBase = n => BASES.some(r => r.test(String(n || '')))
// On n'ouvre jamais la recette de ces produits-là : les bases se préparent dans
// le bloc du haut, et la génoise ne se détaille pas ici (demande de Layla).
const estIngredient = n => /^SM\.\s*/i.test(String(n || ''))
const estGenoise = n => /genoise/i.test(String(n || ''))
// Jamais bloquant : la génoise (stock négatif pour un moment encore) et l'eau
// du robinet, qui ne se gère pas en stock.
const toujoursLa = n => estGenoise(n) || /eau\s*robinet|^\s*MP-\s*Eau/i.test(String(n || ''))
const jamaisDeplier = n => estBase(n) || estIngredient(n) || estGenoise(n)

// Ce qui peut être coché « fait » dans une recette : ni un ingrédient, ni une
// base (elle se coche dans « à préparer »), ni la génoise (on ne la suit pas).
const peutEtreFait = n => estPrepa(n) && !estIngredient(n) && !estBase(n) && !estGenoise(n)
// Une préparation qu'on devrait pouvoir dérouler mais dont la nomenclature est
// absente d'Odoo : on le signale au lieu de laisser la ligne muette.
const sansRecette = (n, recettes) => estPrepa(n) && !estIngredient(n) && !estGenoise(n) && !recettes[n]
// nom lisible par l'équipe : on enlève les codes internes
const propre = n => String(n || '')
  .replace(/^SM\s+CD\*\s*/i, '').replace(/^SM\s+/i, '').replace(/^MP-\s*/i, '').replace(/^C-\s*/i, '')
  .replace(/\s*\bKG\b\s*CD\b/i, '').replace(/\s*\bCD\*?\b\s*$/i, '').replace(/\s*\bkg\b\s*$/i, '')
  .replace(/\s*\baccs\b/i, '').trim()

// ce que produit une tournée de cette préparation (« Tournée (3 kg) » → 3 kg)
function tailleTournee(recettes, n) {
  const r = recettes[n]
  if (!r) return null
  if (norm(r.unite) === 'g') return { q: r.qty / 1000, u: 'kg' }
  const m = String(r.unite).match(/\(([\d.,]+)\s*kg\)/i)
  if (m) return { q: r.qty * parseFloat(m[1].replace(',', '.')), u: 'kg' }
  return { q: r.qty, u: norm(r.unite) }
}

// La recette d'une préparation, calculée pour la quantité demandée.
// Récursive : la crème pâtissière dans la crème au beurre vanille s'ouvre aussi.
function SousRecette({ recettes, produit, qty, unite, chemin = '', ouvertes = {}, setOuvertes = null, faits = {}, onFait = null, onDefaire = null, bloquants = null, stock = 0, couvert = null }) {
  const r = recettes[produit]
  if (!r) return null
  const base = norm(r.unite) === 'g' ? r.qty / 1000 : r.qty
  const uBase = norm(r.unite) === 'g' ? 'kg' : r.unite
  const meme = norm(uBase) === norm(unite) && base
  const f = meme ? qty / base : 1
  return (
    <div className="ml-8 mb-2 bg-cream-warm rounded-xl px-3 py-2.5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-1">
        {propre(produit)} — {meme ? `pour ${qteLisible(qty, unite)}` : `pour ${qteLisible(r.qty, r.unite)}`}
        {stock > 0.001 && <span className="normal-case font-normal"> ({qteLisible(stock, unite)} déjà en stock)</span>}
      </div>
      {trierRecette(r.lignes).map((l, i) => {
        const q = l.qty * f, u = l.unite
        const sousCle = chemin + '>' + l.produit
        const ouvrable = setOuvertes && estPrepa(l.produit) && recettes[l.produit] && !jamaisDeplier(l.produit)
        // « fait » veut dire : la quantité voulue est là. Cocher une crème pour
        // un gâteau ne la rend pas faite pour le suivant — chacun a la sienne.
        const coche = !!faits[clePrepa(l.produit)]
        const ok = couvert ? couvert(l.produit, q) : coche
        // barré = quelqu'un l'a faite ; vert « en stock » = il y en avait déjà
        const barre = ok && coche
        const dispo = ok && !coche
        return (
          <div key={i}>
            <div className="flex items-center gap-2.5 py-1.5 text-[14px] border-b border-dashed border-[#e6ddcd] last:border-0">
              <b className={'min-w-[86px] ' + (barre ? 'line-through opacity-60' : '')}>{qteLisible(q, u)}</b>
              {ouvrable ? (
                <button onClick={() => setOuvertes(o => ({ ...o, [sousCle]: !o[sousCle] }))}
                  className={'text-left text-bordeaux font-semibold underline underline-offset-2 flex-1 ' + (barre ? 'line-through opacity-60' : '')}>
                  {propre(l.produit)} ▾
                </button>
              ) : <span className={'flex-1 ' + (barre ? 'line-through opacity-60' : '')}>{propre(l.produit)}</span>}
              {sansRecette(l.produit, recettes) && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#FFF7E0] text-[#854F0B] whitespace-nowrap">pas de recette</span>
              )}
              {/* déjà en stock : rien à faire, et ce n'est pas « fait » par quelqu'un */}
              {dispo && peutEtreFait(l.produit) && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EAF3DE] text-ok whitespace-nowrap">en stock</span>
              )}
              {onDefaire && coche && !barre && <BoutonDefaire onClick={() => onDefaire(l.produit)} />}
              {onFait && peutEtreFait(l.produit) && !dispo && (
                <BoutonFait fait={ok}
                  bloque={bloquants ? bloquants(l.produit, q) : null}
                  onClick={() => onFait(clePrepa(l.produit), l.produit, q)} />
              )}
            </div>
            {ouvrable && ouvertes[sousCle] && (
              <SousRecette recettes={recettes} produit={l.produit} qty={q} unite={u}
                chemin={sousCle} ouvertes={ouvertes} setOuvertes={setOuvertes}
                faits={faits} onFait={onFait} onDefaire={onDefaire} bloquants={bloquants} couvert={couvert} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// « Ma recette » : les besoins cumulés des gâteaux cochés.
function PanneauRecette({ recettes, recette, ouvertes, setOuvertes, onEffacer, onRetour, faits, onFait, onDefaire, bloquants, manquePour, couvert }) {
  const cle = p => 'sc:' + p
  return (
    <div className={onRetour ? '' : 'bg-white border border-line rounded-2xl sticky top-4 max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden'}>
      <div className={'flex items-center gap-2 ' + (onRetour ? 'mb-2' : 'px-4 pt-4 pb-2 flex-shrink-0 border-b border-line')}>
        {onRetour && <button onClick={onRetour} className="text-[14px] text-bordeaux font-semibold">← Retour</button>}
        <b className="text-[16px]">Ma recette</b>
        <button onClick={onEffacer} className="ml-auto bg-cream-warm rounded-lg px-3 py-1.5 text-[12.5px]">effacer</button>
      </div>
      <div className={onRetour ? '' : 'px-4 pb-4 pt-3 flex-1 overflow-y-auto overscroll-contain'}>
      {recette.map(g => (
        <div key={g.cleGroupe} className="mb-4">
          <div className="text-[12.5px] text-ink-mute mb-1.5 pb-1 border-b border-line">
            <b className="text-ink text-[13.5px]">{g.parfum}</b> · {g.lot.map(o => `${o.taille} ×${nb(o.qty)}`).join(' + ')}
          </div>
          {g.lignes.map(l => (
        <div key={l.produit}>
          <div className="flex items-center gap-3 py-2.5 text-[16px] border-b border-dashed border-[#f0e8db]">
            <b className={'min-w-[96px] text-[17px] ' + (faits[clePrepa(l.produit)] ? 'line-through opacity-60' : '')}>
              {qteLisible(l.qty, l.unite)}
            </b>
            {estPrepa(l.produit) && recettes[l.produit] && !jamaisDeplier(l.produit) && !l.enStock ? (
              <button onClick={() => setOuvertes(o => ({ ...o, [cle(l.produit)]: !o[cle(l.produit)] }))}
                className="flex-1 text-left text-bordeaux font-bold underline underline-offset-4">
                {propre(l.produit)} ▾
              </button>
            ) : (
              <span className="flex-1">
                {propre(l.produit)}
              </span>
            )}
            {sansRecette(l.produit, recettes) && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FFF7E0] text-[#854F0B] whitespace-nowrap">pas de recette dans Odoo</span>
            )}
            {(l.enStock || (couvert && couvert(l.produit, l.qty) && !faits[clePrepa(l.produit)])) && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#EAF3DE] text-ok whitespace-nowrap">en stock</span>
            )}
            {onDefaire && faits[clePrepa(l.produit)] && !(couvert && couvert(l.produit, l.qty))
              && <BoutonDefaire onClick={() => onDefaire(l.produit)} />}
            {peutEtreFait(l.produit) && !l.enStock && !(couvert && couvert(l.produit, l.qty) && !faits[clePrepa(l.produit)]) && (
              <BoutonFait fait={couvert ? couvert(l.produit, l.qty) : !!faits[clePrepa(l.produit)]}
                bloque={bloquants ? bloquants(l.produit, l.aFaire || l.qty) : null}
                onClick={() => onFait(clePrepa(l.produit), l.produit, l.qty)} />
            )}
          </div>
          {l.usages && l.usages.length > 1 && (
            <div className="text-[12px] text-ink-mute pl-[96px] -mt-1 mb-1.5">
              {l.usages.map(([qui, q]) => (
                <div key={qui}>{qteLisible(q, l.unite)} pour {qui}</div>
              ))}
            </div>
          )}
          {manquePour && estPrepa(l.produit) && !estIngredient(l.produit) && !estBase(l.produit) && !l.enStock
            && manquePour(l.produit, l.aFaire || l.qty).length > 0 && (
            <div className="text-[12px] text-[#854F0B] pl-[96px] -mt-1 mb-1.5">
              il manque : {manquePour(l.produit, l.aFaire || l.qty).map(m => `${qteLisible(m.manque, m.unite)} de ${propre(m.produit)}`).join(' · ')}
            </div>
          )}
          {estPrepa(l.produit) && !estIngredient(l.produit) && !estBase(l.produit) && !l.enStock
            && !(couvert ? couvert(l.produit, l.qty) : faits[clePrepa(l.produit)]) && bloquants && bloquants(l.produit, l.aFaire || l.qty).length > 0 && (
            <div className="text-[12px] text-[#854F0B] pl-[96px] -mt-1 mb-1.5">
              à faire d'abord : {bloquants(l.produit, l.aFaire || l.qty).map(propre).join(', ')}
            </div>
          )}
          {!l.enStock && ouvertes[cle(l.produit)] && (
            <SousRecette recettes={recettes} produit={l.produit} qty={l.aFaire || l.qty} unite={l.unite}
              chemin={cle(l.produit)} ouvertes={ouvertes} setOuvertes={setOuvertes}
              faits={faits} onFait={onFait} onDefaire={onDefaire} bloquants={bloquants} couvert={couvert} />
          )}
        </div>
          ))}
        </div>
      ))}
      </div>
    </div>
  )
}

// Retirer la dernière fournée déclarée, tant que rien n'est validé dans Odoo.
function BoutonDefaire({ onClick }) {
  return (
    <button onClick={onClick} title="Annuler la dernière fournée déclarée"
      className="flex-shrink-0 rounded-lg px-2 py-1.5 text-[12px] font-bold border border-line bg-white text-ink-mute">↩</button>
  )
}

function BoutonFait({ fait, onClick, bloque = null }) {
  const empeche = !fait && bloque && bloque.length
  return (
    <button onClick={e => { e.stopPropagation(); if (!empeche) onClick() }}
      title={empeche ? 'À faire d\'abord : ' + bloque.map(propre).join(', ') : fait ? 'Annuler' : 'Marquer comme fait'}
      className={'flex-shrink-0 rounded-lg px-3 py-2 text-[12px] font-bold border ' +
        (fait ? 'bg-ok text-cream border-ok' : empeche ? 'bg-cream-warm text-ink-mute border-line opacity-50 cursor-not-allowed' : 'bg-white text-ink-mute border-line')}>
      {fait ? '✓ fait' : 'fait'}
    </button>
  )
}

function Gateau({ o, on, onToggle, fait, onFait, bloque, onValider }) {
  const stock = o.stockApp != null ? o.stockApp : (o.stock ? o.stock.dispo : null)
  // Une préparation se pèse (8 kg de sirop), un gâteau se compte (×3) : « ×8 »
  // pour 8 kg de sirop se lit comme 8 pièces.
  const pese = /^(g|kg)$/i.test(norm(o.unite))
  const combien = pese ? qteLisible(enKg(o.qty, o.unite).q, 'kg') : `×${nb(o.qty)}`
  const resteTexte = stock === null ? null : (pese ? qteLisible(stock, 'kg') : nb(stock))
  return (
    <div role="button" tabIndex={0} onClick={onToggle}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className={'flex items-center gap-3 border rounded-xl px-3.5 py-3 mb-1.5 cursor-pointer ' +
        (fait ? 'bg-[#EAF3DE] border-[#cfe0b8]' : on ? 'bg-[#fdf4f7] border-bordeaux ring-1 ring-bordeaux' : 'bg-white border-line')}>
      <input type="checkbox" checked={on} readOnly tabIndex={-1} className="w-6 h-6 accent-[#993556] pointer-events-none flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={'text-[18px] font-extrabold ' + (fait ? 'line-through opacity-60' : '')}>
          {o.taille || propre(o.produit)} <span className="text-[13px] font-medium text-ink-soft">{o.parfum}</span>
        </div>
        <div className="text-[11.5px] text-ink-mute">
          {o.scode
            ? <>pour le <b>{jourCourt(o.quand)}</b> · {o.scode}</>
            : (stock === null ? 'stock inconnu' : stock > 0 ? `il en reste ${resteTexte} en stock` : 'plus rien en stock')}
        </div>
      </div>
      {(o.stockAssez ?? (o.stock && o.stock.assez)) && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#EAF3DE] text-ok whitespace-nowrap">déjà en stock</span>}
      {o.recetteVide && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FCEEE8] text-danger">pas de recette dans Odoo</span>}
      {o.enRetard && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FFF7E0] text-[#854F0B]">en retard</span>}
      <span className={'text-[18px] font-extrabold text-bordeaux whitespace-nowrap ' + (fait ? 'line-through opacity-60' : '')}>{combien}</span>
      <BoutonFait fait={fait} onClick={onFait} bloque={bloque} />
      {fait && onValider && (
        <button onClick={e => { e.stopPropagation(); onValider() }}
          className="flex-shrink-0 rounded-lg px-3 py-2 text-[12px] font-bold bg-bordeaux text-cream">valider</button>
      )}
    </div>
  )
}

function Groupe({ titre, list, sel, onToggle, faits, onFait, bloqueGateau, onValider }) {
  if (!list.length) return null
  const parfums = [...new Set(list.map(o => o.parfum || '—'))].sort()
  return (
    <>
      <div className="text-[12.5px] font-bold text-ink-mute mt-4 mb-1.5">{titre}</div>
      {parfums.map(p => list.filter(o => (o.parfum || '—') === p).map(o => (
        <Gateau key={o.name} o={o} on={sel.includes(o.name)} onToggle={() => onToggle(o.name)}
          fait={!!faits[o.name]} onFait={() => onFait(o.name, o.produit, o.qty)} bloque={bloqueGateau(o)} onValider={onValider} />
      )))}
    </>
  )
}

function Titre({ n, children }) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-2">
      <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-bordeaux">{n} · {children}</span>
      <span className="flex-1 h-0.5 bg-line" />
    </div>
  )
}

// Validation dans Odoo : on coche les ordres, on valide ceux qui sont prêts,
// et on ne force que si Layla le demande explicitement (action irréversible).
function ValiderModal({ ordres, user, onClose, onFini }) {
  const [etat, setEtat] = useState('chargement')   // chargement | liste | envoi | resultat
  const [lignes, setLignes] = useState([])
  const [sel, setSel] = useState([])
  const [resultats, setResultats] = useState([])
  const [confirmer, setConfirmer] = useState(false)

  useEffect(() => {
    let vivant = true
    loadManques(ordres)
      .then(l => { if (!vivant) return; setLignes(l); setSel(l.map(x => x.name)); setEtat('liste') })
      .catch(e => { if (vivant) { toast.error(e.message || String(e)); onClose() } })
    return () => { vivant = false }
  }, [ordres, onClose])

  const choisis = lignes.filter(l => sel.includes(l.name))
  const prets = choisis.filter(l => !l.manques.length)
  const bloques = choisis.filter(l => l.manques.length)
  const manquesCumules = [...new Map(bloques.flatMap(l => l.manques).map(m => [m.produit, m])).values()]

  const lancer = async (forcer) => {
    const cibles = (forcer ? bloques : prets).map(l => l.name)
    if (!cibles.length) return
    setEtat('envoi')
    try {
      const r = await validerDansOdoo(cibles, forcer, user?.id)
      setResultats(r); setEtat('resultat')
    } catch (e) { toast.error(e.message || String(e)); setEtat('liste') }
  }

  const Ligne = ({ l }) => (
    <div className={'border rounded-xl mb-2 overflow-hidden ' + (l.manques.length ? 'border-l-4 border-l-[#d9a441] border-line' : 'border-l-4 border-l-[#7ba05b] border-line')}>
      <div className="flex items-center gap-3 px-3 py-2.5 bg-white">
        <input type="checkbox" checked={sel.includes(l.name)} className="w-5 h-5 accent-[#993556]"
          onChange={e => setSel(v => (e.target.checked ? [...v, l.name] : v.filter(x => x !== l.name)))} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold">{propre(l.produit)} — {qteLisible(norm(l.unite) === 'kg' ? l.qty : l.qty / 1000, 'kg')}</div>
          <div className="text-[11px] text-ink-mute font-mono">{l.name}{l.pour ? ' · ' + l.pour : ''}</div>
        </div>
        <span className={'text-[10.5px] font-bold px-2 py-0.5 rounded-full ' + (l.manques.length ? 'bg-[#FFF7E0] text-[#854F0B]' : 'bg-[#EAF3DE] text-ok')}>
          {l.manques.length ? 'il manque' : 'prêt'}
        </span>
      </div>
      {l.manques.length > 0 && (
        <div className="border-t border-dashed border-line bg-[#fffdf7] px-3 py-2 text-[12.5px]">
          {l.manques.map((m, i) => (
            <div key={i}>• <b>{qteLisible(norm(m.unite) === 'kg' ? m.manque : m.manque / 1000, 'kg')}</b> de {propre(m.produit)}</div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[70] bg-ink/40 flex items-start justify-center p-3 pt-10 overflow-auto"
      onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream rounded-2xl w-full max-w-[640px] shadow-2xl overflow-hidden">
        <div className="bg-bordeaux text-cream px-4 py-3 flex items-center gap-3">
          <b className="text-[16px]">Valider dans Odoo</b>
          <button onClick={onClose} className="ml-auto bg-white/20 rounded-lg px-3 py-1 text-[12.5px]">Fermer</button>
        </div>
        <div className="p-4">
          {etat === 'chargement' && <p className="text-center text-ink-mute py-8">Vérification des stocks…</p>}
          {etat === 'envoi' && <p className="text-center text-ink-mute py-8">Validation en cours dans Odoo…</p>}

          {etat === 'liste' && (
            <>
              <p className="text-[12.5px] text-ink-mute mb-3">
                Ce que l'équipe a marqué « fait ». La génoise n'est pas comptée dans les manques.
              </p>
              {lignes.map(l => <Ligne key={l.name} l={l} />)}
              <div className="text-[12.5px] text-ink-soft mb-2">
                {choisis.length} sélectionné(s) · {prets.length} prêt(s), {bloques.length} à forcer
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => lancer(false)} disabled={!prets.length}
                  className={'flex-1 min-w-[200px] rounded-xl py-3 text-[15px] font-bold ' + (prets.length ? 'bg-bordeaux text-cream' : 'bg-white border border-line text-ink-mute')}>
                  Valider la sélection{prets.length ? ` (${prets.length})` : ''}
                </button>
                <button onClick={() => setConfirmer(true)} disabled={!bloques.length}
                  className={'rounded-xl py-3 px-4 text-[13.5px] font-bold border ' + (bloques.length ? 'border-danger text-danger bg-white' : 'border-line text-ink-mute bg-white')}>
                  Forcer la sélection{bloques.length ? ` (${bloques.length})` : ''}
                </button>
              </div>
            </>
          )}

          {etat === 'resultat' && (
            <>
              {resultats.map(r => (
                <div key={r.name} className={'rounded-xl px-3 py-2.5 mb-2 ' + (r.ok ? 'bg-[#EAF3DE] border border-[#cfe0b8]' : 'bg-[#FCEEE8] border border-[#f0c9c9]')}>
                  <b className="text-[14px]">{r.ok ? '✓' : '✗'} {r.name}</b>
                  <div className="text-[12.5px] text-ink-soft">{r.ok ? 'validé dans Odoo' : r.message}</div>
                </div>
              ))}
              <button onClick={onFini} className="w-full bg-bordeaux text-cream rounded-xl py-3 text-[15px] font-bold mt-2">Terminer</button>
            </>
          )}
        </div>
      </div>

      {confirmer && (
        <div className="fixed inset-0 z-[80] bg-ink/50 flex items-center justify-center p-4" onPointerDown={e => { if (e.target === e.currentTarget) setConfirmer(false) }}>
          <div className="bg-white rounded-2xl p-4 max-w-[420px]">
            <b className="text-[16px]">Forcer la validation ?</b>
            <p className="text-[13px] text-ink-soft mt-1 mb-2">Odoo enregistrera la fabrication même si le stock ne suit pas. Il manque :</p>
            {manquesCumules.map((m, i) => (
              <div key={i} className="text-[13.5px]">• <b>{qteLisible(norm(m.unite) === 'kg' ? m.manque : m.manque / 1000, 'kg')}</b> de {propre(m.produit)}</div>
            ))}
            <p className="text-[12px] text-ink-mute mt-2">Le stock de ces articles deviendra négatif dans Odoo.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setConfirmer(false); lancer(true) }} className="flex-1 bg-danger text-cream rounded-xl py-3 text-[14px] font-bold">Forcer</button>
              <button onClick={() => setConfirmer(false)} className="rounded-xl py-3 px-4 text-[14px] border border-line">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FabricationView({ user, onLogout, onNavigate, activeView }) {
  const [data, setData] = useState(() => dernierEcran('fabrication'))
  const [erreur, setErreur] = useState(null)
  const [sel, setSel] = useState([])                      // noms d'OF cochés
  const [ouvertes, setOuvertes] = useState({})            // sous-recettes dépliées
  const [pageRecette, setPageRecette] = useState(false)   // téléphone : recette en page à part
  const [faits, setFaits] = useState({})                  // ce qui est déjà fait (app, pas Odoo)
  const [validerOuvert, setValiderOuvert] = useState(false)

  const [rechargement, setRechargement] = useState(0)

  // Plusieurs personnes cochent en même temps sur des téléphones différents :
  // chacun voit les coches des autres arriver en direct, plutôt que d'écraser
  // le travail du voisin sans le savoir.
  useEffect(() => {
    const canal = supabase
      .channel('fabrication-faits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prod_of_faits' },
        () => { loadFaits().then(setFaits).catch(() => { }) })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])
  useEffect(() => {
    let vivant = true
    loadFaits().then(f => { if (vivant) setFaits(f) }).catch(() => { })
    loadFabrication(60)
      .then(d => { if (vivant) { setData(d); garderEcran('fabrication', d) } })
      .catch(e => { if (!vivant) return; setErreur(e.message || String(e)); setData({ ofs: [], recettes: {}, stocks: {} }) })
    return () => { vivant = false }
  }, [rechargement])

  // Odoo fait foi : après une annulation, une modification ou une validation
  // faite là-bas, ce bouton remet l'écran à jour sans changer de page.
  const relire = () => { setData(null); setErreur(null); setRechargement(v => v + 1) }

  const recettes = useMemo(() => (data && data.recettes) || {}, [data])
  // ====== Le stock tel que l'app le voit ======
  // Odoo ne bouge qu'à la validation. Entre le moment où l'équipe coche « fait »
  // et celui où on valide, l'app tient son propre compte : + ce qui vient d'être
  // fabriqué, − ce que ces fabrications ont consommé. Sans ça l'écran redemande
  // une crème qu'on vient de faire, et un gâteau coché ne consomme rien.
  const [stocks, stocksBases] = useMemo(() => {
    const s = {}, sb = {}
    for (const [k, v] of Object.entries((data && data.stocks) || {})) { s[k] = { ...v }; sb[k] = { ...v } }
    const ajoute = (m, produit, dKg) => {
      const st = m[produit]
      if (!st) { m[produit] = { qty: dKg, unite: 'kg' }; return }
      st.qty += norm(st.unite) === 'g' ? dKg * 1000 : dKg
    }
    // Deux comptes : le stock complet pour tout l'écran, et un second où l'on
    // n'ajoute PAS la production des bases. Une base doit voir ce que les crèmes
    // parfumées lui prennent, mais pas se recharger elle-même : sinon, à peine
    // cochée, elle passerait « en stock » et son bouton disparaîtrait.
    const bouge = (produit, dKg) => {
      ajoute(s, produit, dKg)
      if (dKg > 0 && estBase(produit)) return
      ajoute(sb, produit, dKg)
    }
    // ce qu'une préparation consomme, d'après sa recette, pour cette quantité
    const consomme = (produit, qtyKg) => {
      const r = recettes[produit]
      if (!r) return
      const base = norm(r.unite) === 'g' ? r.qty / 1000 : r.qty
      const f = base ? qtyKg / base : 1
      for (const l of r.lignes) bouge(l.produit, -enKg(l.qty * f, l.unite).q)
    }
    const ofs = (data && data.ofs) || []
    const parOf = new Map(ofs.map(o => [o.name, o]))
    const parOrdre = new Map(((data && data.ordres) || []).map(o => [o.name, o]))
    // 1) ce qui est coché par son ordre Odoo
    const comptes = new Set()
    for (const cle of Object.keys(faits)) {
      if (cle.startsWith('PREP:')) continue
      // un article de l'écran : il produit, et il a consommé ses composants
      const o = parOf.get(cle)
      if (o) {
        bouge(o.produit, enKg(o.qty, o.unite).q)
        comptes.add(o.produit)
        for (const l of o.recette || []) bouge(l.produit, -enKg(l.qty, l.unite).q)
        continue
      }
      // une tournée lancée ailleurs (glaçage, pâte à sucre) encore ouverte
      const ord = parOrdre.get(cle)
      if (ord) { bouge(ord.produit, enKg(ord.qty, ord.unite).q); comptes.add(ord.produit) }
    }
    // 2) les préparations cochées par leur nom, sauf celles déjà comptées
    // ci-dessus : le même article peut se cocher depuis une recette ET depuis
    // « Demandé par Odoo », il ne doit pas compter deux fois.
    const jour = aujourdhui()
    for (const [cle, info] of Object.entries(faits)) {
      if (!cle.startsWith('PREP:')) continue
      // seulement les coches du jour : une préparation se refait chaque matin,
      // celle d'hier est réputée consommée (l'écran la redemande d'ailleurs).
      // La date peut porter un numéro de fournée : « …:2026-08-25#2 ».
      if (!cle.slice(cle.lastIndexOf(':') + 1).startsWith(jour)) continue
      const produit = cle.slice(5, cle.lastIndexOf(':'))
      if (comptes.has(produit)) continue
      const q = Number(info && info.qty) || 0
      if (q > 0) { bouge(produit, q); consomme(produit, q) }
    }
    return [s, sb]
  }, [data, faits, recettes])

  // le stock d'un article, jamais négatif (en kg, ou en unités pour les gâteaux)
  const stockDeProduit = n => { const st = stocks[n]; return st ? Math.max(0, enKg(st.qty, st.unite).q) : 0 }

  // « Fait » ne veut pas dire « quelqu'un a coché ce produit aujourd'hui » mais
  // « la quantité voulue est là ». Une crème faite pour un gâteau ne rend pas
  // le gâteau suivant servi : chacun a la sienne.
  const couvert = (produit, besoin) => stockDeProduit(produit) >= (Number(besoin) || 0) - 0.001
  // une base suivie par un ordre Odoo garde la coche de cet ordre ; sinon, même
  // règle que le reste : c'est fait quand la quantité est là
  // On compare au BESOIN, pas à la taille de la tournée : il reste 7 240 g de
  // sirop et une tournée en fait 5 550, mais s'il en faut 7 580 ce n'est pas fait.
  const faitBase = b => (b.ordre ? !!faits[b.ordre] : couvert(b.produit, b.besoin))
  // Barré = quelqu'un l'a faite. Une base simplement couverte par le stock reste
  // lisible : elle porte déjà son « en stock (x g) ».
  const baseBarree = b => (b.ordre ? !!faits[b.ordre] : clesDuJour(b.produit).length > 0)

  // Tous les ordres de fabrication ouverts sont montrés, même si l'article est
  // déjà en stock : si Odoo a lancé l'ordre, c'est qu'il y a une raison.
  // Seul ce qui est marqué « fait » quitte l'écran (il attend dans « À valider »).
  const aFaire = useMemo(
    () => ((data && data.ofs) || []).filter(o => !faits[o.name]).map(o => {
      const dispo = stockDeProduit(o.produit)
      return { ...o, stockApp: dispo, stockAssez: dispo >= enKg(o.qty, o.unite).q - 0.001 }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, faits, stocks])
  const gateaux = useMemo(() => aFaire.filter(o => o.taille), [aFaire])
  // Tout ce qui est coché alimente la recette de droite — les gâteaux comme les
  // préparations demandées par Odoo (sirop, crème STK), qui n'ont pas de taille.
  const choisis = useMemo(() => aFaire.filter(o => sel.includes(o.name)), [aFaire, sel])

  // les bases nécessaires : demandées directement, ou par les crèmes qu'il faut faire
  const bases = useMemo(() => {
    const stockDe = n => { const st = stocksBases[n]; return st ? Math.max(0, enKg(st.qty, st.unite).q) : 0 }
    const src = aFaire        // les bases restent les mêmes, quoi qu'on coche
    const besoins = {}
    for (const o of src) for (const r of (o.recette || [])) {
      const k = enKg(r.qty, r.unite)
      besoins[r.produit] = (besoins[r.produit] || 0) + k.q
    }
    const out = {}
    for (const [p, q] of Object.entries(besoins)) {
      if (!estPrepa(p)) continue
      if (estBase(p)) { out[p] = (out[p] || 0) + q; continue }
      const r = recettes[p]
      if (!r) continue
      const base = norm(r.unite) === 'g' ? r.qty / 1000 : r.qty
      const manque = Math.max(0, q - stockDe(p))
      if (!base || !manque) continue
      const f = manque / base
      for (const l of r.lignes) {
        if (!estPrepa(l.produit) || !estBase(l.produit)) continue
        const k = enKg(l.qty * f, l.unite)
        out[l.produit] = (out[l.produit] || 0) + k.q
      }
    }
    const liste = Object.entries(out).map(([p, q]) => {
      const stock = stockDe(p), t = tailleTournee(recettes, p)
      const manque = Math.max(0, q - stock)
      const n = t && t.q ? Math.ceil(manque / t.q) : 0
      return { produit: p, besoin: q, stock, manque, n, qty: n * ((t && t.q) || 0), unite: (t && t.u) || 'kg' }
    })
    return liste.sort((a, b) => rang(a.produit) - rang(b.produit) || String(a.produit).localeCompare(String(b.produit)))
  }, [aFaire, recettes, stocksBases])

  // Ce qu'Odoo demande de préparer parce que le stock mini est atteint : crèmes
  // STK, base cupcake, magnum… (tous les articles CD* qui ne sont pas un format).
  const demandeOdoo = useMemo(() => {
    const stockDe = n => { const st = stocks[n]; return st ? Math.max(0, enKg(st.qty, st.unite).q) : 0 }
    return aFaire.filter(o => !o.taille).map(o => {
      const k = enKg(o.qty, o.unite)
      const stock = stockDe(o.produit)
      return { produit: o.produit, qty: k.q, unite: k.u, besoin: k.q, stock, manque: Math.max(0, k.q - stock), ordre: o.name, n: 1 }
    })
  }, [aFaire, stocks])

  // La recette des gâteaux cochés, calculée SÉPARÉMENT PAR PARFUM : deux parfums
  // différents ne se mélangent jamais (règle de Layla). À l'intérieur d'un parfum
  // les quantités s'additionnent, et ce que réclament les crèmes s'ajoute en
  // cascade (la crème citron sert au gâteau ET à la crème au beurre citron).
  const recetteParParfum = useMemo(() => {
    if (!choisis.length) return []
    const stockDe = n => { const st = stocks[n]; return st ? Math.max(0, enKg(st.qty, st.unite).q) : 0 }
    const cremeDe = o => {
      // une préparation ne se mélange avec rien : elle fait son propre groupe,
      // et la version STK reste distincte de la version normale
      if (!o.taille) return o.produit
      const c = (o.recette || []).find(r => /cr[eè]me au beurre/i.test(r.produit) && !/nature/i.test(r.produit))
      return c ? sansStk(c.produit) : (o.parfum || '—')
    }
    const groupes = [...new Set(choisis.map(cremeDe))]
    return groupes.map(cleGroupe => {
      const lot = choisis.filter(o => cremeDe(o) === cleGroupe)
      const parfum = [...new Set(lot.map(o => o.parfum).filter(Boolean))].join(' + ')
        || (lot[0] && !lot[0].taille ? propre(lot[0].produit) : '—')
      const besoins = {}
      const ajoute = (produit, qty, source) => {
        const c = produit                       // STK reste distinct du produit normal
        const e = besoins[c] || (besoins[c] = { qty: 0, usages: {} })
        e.qty += qty
        e.usages[source] = (e.usages[source] || 0) + qty
      }
      // on note quel gâteau demande quoi, pour pouvoir dire « 400 g pour le 20 cm »
      for (const o of lot) for (const r of (o.recette || [])) {
        ajoute(r.produit, enKg(r.qty, r.unite).q, `le ${o.taille}`)
        besoins[r.produit].direct = true
      }
      const file = Object.keys(besoins).filter(estPrepa), vus = new Set()
      while (file.length) {
        const pr = file.shift()
        if (vus.has(pr)) continue
        vus.add(pr)
        const r = recettes[pr]
        if (!r) continue
        const manque = besoins[pr].qty - stockDe(pr)
        if (manque <= 0.001) continue
        const base = norm(r.unite) === 'g' ? r.qty / 1000 : r.qty
        if (!base) continue
        const f = manque / base
        for (const l of r.lignes) {
          if (!estPrepa(l.produit) || estIngredient(l.produit)) continue
          ajoute(l.produit, enKg(l.qty * f, l.unite).q, propre(pr))
          if (!vus.has(l.produit)) file.push(l.produit)
        }
      }
      const lignes = trierRecette(Object.entries(besoins)
        .filter(([, e]) => e.direct)                            // pas les composants des crèmes
        .map(([produit, e]) => {
          const stock = estPrepa(produit) ? stockDe(produit) : 0
          return {
            produit, qty: e.qty, unite: 'kg', stock,
            aFaire: Math.max(0, e.qty - stock),
            enStock: estPrepa(produit) && stock >= e.qty,
            usages: Object.entries(e.usages).filter(([, q]) => q > 0.001),
          }
        }))
      return { parfum, cleGroupe, lot, lignes }
    })
  }, [choisis, recettes, stocks])

  // Ce qu'il faut avoir fait AVANT de pouvoir cocher : les préparations que ce
  // produit consomme et qui ne sont pas en stock (crème pâtissière avant la crème
  // au beurre vanille, crèmes avant le gâteau…).
  const bloquants = (produit, qty) => {
    const r = recettes[produit]
    if (!r) return []
    const base = norm(r.unite) === 'g' ? r.qty / 1000 : r.qty
    const f = base ? (qty || base) / base : 1
    return r.lignes
      .filter(l => estPrepa(l.produit) && !estIngredient(l.produit) && !toujoursLa(l.produit))
      .filter(l => recettes[l.produit])                                        // sans recette, rien à faire ici
      .filter(l => stockDeProduit(l.produit) < enKg(l.qty * f, l.unite).q)      // il faut vraiment le faire
      .map(l => l.produit)
  }
  // pour un gâteau : ses préparations non faites (celles qui ne sont pas en stock)
  const bloquantsGateau = o => (o.recette || [])
    .filter(r => estPrepa(r.produit) && !estIngredient(r.produit) && !toujoursLa(r.produit))
    // Sans recette dans Odoo, l'app ne sait ni la montrer ni créer l'ordre :
    // bloquer là-dessus condamnerait l'article pour toujours.
    .filter(r => recettes[r.produit])
    .filter(r => stockDeProduit(r.produit) < enKg(r.qty, r.unite).q - 0.001)
    .map(r => r.produit)

  // Les ordres Odoo correspondant à ce qui est marqué fait : l'ordre lui-même
  // pour un gâteau, et tous les ordres du produit pour une préparation.
  const ordresAValider = useMemo(() => {
    const tous = (data && data.ordres) || []
    const out = new Set()
    const ouverts = new Set(tous.map(o => o.name))
    for (const o of gateaux) if (faits[o.name]) out.add(o.name)
    // les ordres créés ailleurs (tournées de glaçage) : la clé EST le nom d'ordre
    for (const c of Object.keys(faits)) if (/^WH.*\/MO\//i.test(c) && ouverts.has(c)) out.add(c)
    for (const [c, info] of Object.entries(faits)) {
      if (!c.startsWith('PREP:')) continue
      for (const n of (info && info.ordres) || []) if (ouverts.has(n)) out.add(n)
    }
    return [...out]
  }, [data, gateaux, faits])

  // Ce qui manque en stock pour fabriquer cette quantité : matières premières
  // comprises (la génoise est ignorée, son stock restera négatif un moment).
  const manquePour = (produit, qty) => {
    const r = recettes[produit]
    if (!r) return []
    const base = norm(r.unite) === 'g' ? r.qty / 1000 : r.qty
    if (!base) return []
    const f = qty / base
    const out = []
    for (const l of r.lignes) {
      if (/genoise|eau\s*robinet|^\s*MP-\s*Eau/i.test(l.produit)) continue
      const besoin = enKg(l.qty * f, l.unite)
      const st = stocks[l.produit]
      const dispo = st ? Math.max(0, enKg(st.qty, st.unite).q) : 0
      if (dispo < besoin.q - 0.0001) out.push({ produit: l.produit, manque: besoin.q - dispo, unite: besoin.u })
    }
    return out
  }

  const toggle = name => setSel(s => (s.includes(name) ? s.filter(x => x !== name) : [...s, name]))
  // Les ordres Odoo derrière une coche. Pour un ordre, c'est lui-même. Pour une
  // préparation cochée par son nom, ce sont les ordres de cet article RATTACHÉS
  // aux gâteaux de l'écran (leur origine est un de ces ordres) : sinon on
  // tomberait sur n'importe quel ordre du même article, même prévu dans quinze
  // jours — cas vécu avec la crème au beurre praliné.
  const ordresDe = (cle, produit) => {
    if (!cle.startsWith('PREP:')) return [cle]
    const tous = (data && data.ordres) || []
    const ici = new Set(((data && data.ofs) || []).map(o => o.name))
    const siens = tous.filter(o => o.produit === produit && o.etat !== 'done')
    // d'abord ceux qui viennent des gâteaux affichés, sinon rien : mieux vaut
    // ne rien proposer que de valider l'ordre de quelqu'un d'autre
    return siens.filter(o => ici.has(o.origine)).map(o => o.name)
  }

  // Les coches d'une préparation pour aujourd'hui. Il peut y en avoir plusieurs :
  // on refait de la crème quand la première fournée est partie ailleurs.
  const clesDuJour = produit => {
    const base = clePrepa(produit)
    return Object.keys(faits).filter(c => c === base || c.startsWith(base + '#')).sort()
  }
  const cleLibre = produit => {
    const base = clePrepa(produit)
    if (!faits[base]) return base
    let i = 2
    while (faits[base + '#' + i]) i += 1
    return base + '#' + i
  }

  // Défaire tant que ce n'est pas validé : on retire la dernière fournée
  // déclarée, on libère sa réservation et on annule l'ordre si c'est l'app qui
  // l'avait créé.
  const defaire = async produit => {
    const cles = clesDuJour(produit)
    if (!cles.length) return
    const cle = cles[cles.length - 1]
    const avant = faits[cle]
    setFaits(f => { const n = { ...f }; delete n[cle]; return n })
    const ordres = (avant && avant.ordres) || []
    reserverOrdres(ordres, false)
    annulerOfPrepa(ordres)
    setFait({ name: cle }, false, user?.id).catch(() => { })
  }

  const marquer = async (cleDemandee, produit, qty) => {
    const prepa = cleDemandee.startsWith('PREP:')
    const dejaLa = prepa ? clesDuJour(produit) : []
    // Sur une préparation, le bouton dit « ✓ fait » quand la quantité voulue est
    // là : cliquer annule alors la dernière coche. Sinon on ajoute une fournée.
    const annule = prepa ? (dejaLa.length > 0 && couvert(produit, qty)) : !!faits[cleDemandee]
    const cle = prepa ? (annule ? dejaLa[dejaLa.length - 1] : cleLibre(produit)) : cleDemandee
    const on = !annule
    // Une base se fait toujours par tournée entière. Pour une crème, on ne refait
    // que ce qui manque : le besoin total moins ce qu'il y a déjà. `qty` est
    // TOUJOURS le besoin total — le stock n'est déduit qu'ici, une seule fois.
    const quantite = (!prepa || estBase(produit)) ? qty : (Math.max(0, qty - stockDeProduit(produit)) || qty)
    const avant = faits[cle]
    const trouves = ordresDe(cle, produit)
    // la coche s'affiche tout de suite, le reste se fait derrière
    setFaits(f => { const n = { ...f }; if (on) n[cle] = { fait_le: new Date().toISOString(), produit, qty: quantite, ordres: trouves }; else delete n[cle]; return n })

    // Une préparation qu'Odoo ne demandait pas (ni ordre, ni règle mini/maxi) :
    // l'app crée l'ordre à la quantité faite, sinon rien n'entrerait jamais en
    // stock. Si on décoche, cet ordre-là est annulé.
    const cree = (on && cle.startsWith('PREP:') && !trouves.length)
      ? await creerOfPrepa(produit, quantite, user?.id)
      : null
    // en mode test aucun ordre n'existe : on n'enregistre pas de faux numéro
    const ordres = cree && cree.name && !cree.error && !cree.test ? [cree.name] : trouves
    if (cree && cree.name && !cree.error && !cree.test) {
      setFaits(f => (f[cle] ? { ...f, [cle]: { ...f[cle], ordres } } : f))
      toast.success(`Ordre ${cree.name} créé dans Odoo`)
    } else if (cree && cree.test) {
      toast.success('Mode test : aucun ordre créé dans Odoo')
    } else if (cree && cree.error) {
      toast.error('Odoo : ' + cree.error)
    }
    if (!on) annulerOfPrepa((avant && avant.ordres) || [])

    // Odoo bloque (ou libère) ce que cette fabrication consomme : les autres
    // ordres ne comptent plus sur le même stock.
    reserverOrdres(ordres, on)
    setFait({ name: cle, produit, qty: quantite, ordres, quand: new Date().toISOString() }, on, user?.id)
      .catch(() => setFaits(f => { const n = { ...f }; if (on) delete n[cle]; else n[cle] = { fait_le: '' }; return n }))
  }
  const effacer = () => { setSel([]); setPageRecette(false) }

  // téléphone : la recette occupe tout l'écran
  if (pageRecette && choisis.length > 0) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
        <div className="max-w-[620px] mx-auto px-4 py-5">
          <PanneauRecette recettes={recettes} recette={recetteParParfum} ouvertes={ouvertes}
            setOuvertes={setOuvertes} onEffacer={effacer} onRetour={() => setPageRecette(false)}
            faits={faits} onFait={marquer} onDefaire={defaire} bloquants={bloquants} manquePour={manquePour} couvert={couvert} />
        </div>
      </div>
    )
  }

  const cleBase = p => 'sc:' + p
  const deuxColonnes = choisis.length > 0

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      {/* mise en page fixe : à faire à gauche, recettes à droite (elle ne bouge plus) */}
      <div className="mx-auto px-4 py-5 max-w-[1100px] grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className={deuxColonnes ? 'pb-40 sm:pb-24 lg:pb-0' : ''}>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="font-fraunces italic text-[27px] font-medium">Fabrication CD</h1>
            <button onClick={relire} title="Relire Odoo (après une annulation ou une validation faite là-bas)"
              className="ml-auto bg-white border border-line rounded-xl px-3 py-2 text-[13px] text-ink-soft">↻ Actualiser</button>
            {canValiderOf(user) && ordresAValider.length > 0 && (
              <button onClick={() => onNavigate && onNavigate('fabrication-valider')}
                className="bg-bordeaux text-cream rounded-xl px-4 py-2.5 text-[13.5px] font-bold">
                À valider ({ordresAValider.length})
              </button>
            )}
          </div>

          {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] my-3">Impossible de lire Odoo : {erreur}</div>}
          {!data && !erreur && <Skeleton rows={5} />}

          {data && (
            <>
              <Titre n="1">Bases à préparer</Titre>
              {/* d'où vient le calcul : sinon on se demande pourquoi le craquant est là */}
              <p className="text-[12px] text-ink-mute -mt-1 mb-2">pour tous les gâteaux en attente</p>
              {bases.length === 0 && <p className="text-center text-ink-mute text-[14px] py-6">Rien à préparer en base.</p>}
              {bases.map(b => {
                // Rien à préparer quand il en reste assez : on n'ouvre pas la
                // recette d'un article déjà en stock (demande de Layla).
                const ouvrable = !!recettes[b.produit] && b.manque > 0.001
                return (
                <div key={b.produit}>
                  {/* Toute la carte ouvre la recette : viser le petit bouton « recette »
                      au doigt était pénible. Le bouton reste, comme repère visuel. */}
                  <div onClick={ouvrable ? () => setOuvertes(o => ({ ...o, [cleBase(b.produit)]: !o[cleBase(b.produit)] })) : undefined}
                    className={'flex items-center gap-3 border border-line rounded-xl px-3.5 py-3 mb-1.5 border-l-4 ' +
                    (ouvrable ? 'cursor-pointer ' : '') +
                    (b.manque <= 0.001 || faitBase(b) ? 'border-l-[#cfe0b8] bg-[#EAF3DE]' : 'border-l-bordeaux bg-white')}>
                    <span className={'flex-1 min-w-0 ' + (baseBarree(b) ? 'line-through opacity-60' : '')}>
                      <span className="text-[17px] font-bold">{propre(b.produit)}</span>
                      {b.ordre && <span className="block text-[11px] text-ink-mute font-mono">demandé par Odoo · {b.ordre}</span>}
                    </span>
                    {b.manque <= 0.001 ? (
                      <span className="text-[13px] font-bold text-ok">en stock ({qteLisible(b.stock, b.unite)})</span>
                    ) : (
                      <>
                        <span className="text-[11.5px] text-ink-mute text-right leading-tight">
                          il en reste<br /><b>{qteLisible(b.stock, b.unite)}</b>
                        </span>
                        <span className={'text-right ' + (baseBarree(b) ? 'line-through opacity-60' : '')}>
                          <span className="text-[19px] font-extrabold text-bordeaux">{qteLisible(b.qty, b.unite)}</span>
                          {b.n > 0 && <span className="block text-[10.5px] text-ink-mute leading-tight">{b.n} tournée{b.n > 1 ? 's' : ''}</span>}
                        </span>
                        {recettes[b.produit] && (
                          <span className="text-ink-mute text-[13px] px-1" aria-hidden="true">
                            {ouvertes[cleBase(b.produit)] ? '▾' : '▸'}
                          </span>
                        )}
                        {!b.ordre && clesDuJour(b.produit).length > 0 && !faitBase(b)
                          && <BoutonDefaire onClick={() => defaire(b.produit)} />}
                        <BoutonFait fait={faitBase(b)} bloque={bloquants(b.produit, b.qty)}
                          onClick={() => marquer(b.ordre || clePrepa(b.produit), b.produit, b.qty)} />
                      </>
                    )}
                  </div>
                  {b.manque > 0.001 && manquePour(b.produit, b.qty).length > 0 && (
                    <div className="text-[12px] text-[#854F0B] pl-3.5 -mt-0.5 mb-1.5">
                      il manque : {manquePour(b.produit, b.qty).map(m => `${qteLisible(m.manque, m.unite)} de ${propre(m.produit)}`).join(' · ')}
                    </div>
                  )}
                  {ouvrable && ouvertes[cleBase(b.produit)] && (
                    <SousRecette recettes={recettes} produit={b.produit} qty={b.qty} unite={b.unite}
                      chemin={cleBase(b.produit)} ouvertes={ouvertes} setOuvertes={setOuvertes}
                      faits={faits} onFait={marquer} onDefaire={defaire} bloquants={bloquants} couvert={couvert} />
                  )}
                </div>
                )
              })}

              {demandeOdoo.length > 0 && (
                <>
                  <Titre n="2">Demandé par Odoo</Titre>
                  <p className="text-[12px] text-ink-mute -mt-1 mb-2">stock mini atteint</p>
                  {demandeOdoo.map(b => {
                    // dans aFaire, pas dans data.ofs : c'est là que le stock
                    // de l'app (celui qui tient compte du « fait ») est calculé
                    const o = aFaire.find(x => x.name === b.ordre) || {
                      name: b.ordre, produit: b.produit, qty: b.qty, unite: b.unite, recette: [],
                    }
                    return (
                      <Gateau key={b.ordre} o={o} on={sel.includes(o.name)} onToggle={() => toggle(o.name)}
                        fait={!!faits[b.ordre]} onFait={() => marquer(b.ordre, b.produit, b.qty)}
                        bloque={bloquants(b.produit, b.qty)}
 />
                    )
                  })}
                </>
              )}

              <Titre n={demandeOdoo.length ? 3 : 2}>Gâteaux à faire</Titre>
              {gateaux.length === 0 && <p className="text-center text-ink-mute text-[14px] py-6">Aucun gâteau à faire.</p>}
              <Groupe titre="STOCK" list={gateaux.filter(o => !o.scode)} sel={sel} onToggle={toggle} faits={faits} onFait={marquer} bloqueGateau={bloquantsGateau}
 />
              <Groupe titre="COMMANDE" list={gateaux.filter(o => o.scode)} sel={sel} onToggle={toggle} faits={faits} onFait={marquer} bloqueGateau={bloquantsGateau}
 />
            </>
          )}
        </div>

        {/* ordinateur : la recette occupe toujours la colonne de droite */}
        <div className="hidden lg:block lg:mt-[70px]">
          {deuxColonnes ? (
            <PanneauRecette recettes={recettes} recette={recetteParParfum} ouvertes={ouvertes}
              setOuvertes={setOuvertes} onEffacer={effacer} onRetour={null} faits={faits} onFait={marquer} onDefaire={defaire} bloquants={bloquants} manquePour={manquePour} couvert={couvert} />
          ) : (
            <div className="bg-white border border-dashed border-line rounded-2xl p-6 text-center text-ink-mute text-[13.5px] sticky top-4">
              Coche des gâteaux à gauche :<br />leur recette s'affichera ici, additionnée.
            </div>
          )}
        </div>
      </div>

      {validerOuvert && (
        <ValiderModal ordres={ordresAValider} user={user}
          onClose={() => setValiderOuvert(false)}
          onFini={() => { setValiderOuvert(false); relire() }} />
      )}

      {/* téléphone : barre fixe qui ouvre la recette en page entière */}
      {deuxColonnes && (
        <button onClick={() => setPageRecette(true)}
          className="lg:hidden lg-bottom-bar z-40 bg-bordeaux text-cream py-4 text-[16px] font-bold shadow-lg">
          Voir ma recette ({choisis.length} gâteau{choisis.length > 1 ? 'x' : ''})
        </button>
      )}
    </div>
  )
}
