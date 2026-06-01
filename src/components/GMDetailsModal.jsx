import { useState, useEffect, useMemo } from 'react'
import {
  detectTypeFromName, isMixteProduct, getMixteParfums, extractParfumsFromName,
  extractTailleFromName, getRealQuantity,
  TYPE_LABELS, TYPE_EMOJIS, TYPE_SPEC,
  loadFiche, saveFiche, makeEmptyLot, lotsTotal, isLotsValid, loadPalette,
} from '../lib/gmFiches'
import LotEditor from './LotEditor'

// ============================================================
// GMDetailsModal : modal pour definir les lots d'un GM-/GMD-/RA-
// ============================================================
export default function GMDetailsModal({ item, onClose, onSaved }) {
  const productName = item?.title || ''
  const typeGm = detectTypeFromName(productName)
  const isMixte = isMixteProduct(productName)
  const taille = extractTailleFromName(productName)
  const expectedQty = getRealQuantity(item)

  const [palette, setPalette] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Etat de la fiche
  const [parfumNormal, setParfumNormal] = useState(false)
  const [tetePosition, setTetePosition] = useState('bas')
  const [lots, setLots] = useState([])
  const [notePatissier, setNotePatissier] = useState('')

  const spec = TYPE_SPEC[typeGm] || null
  const odooParfums = useMemo(() => extractParfumsFromName(productName, typeGm), [productName, typeGm])

  // Chargement initial : palette + fiche existante
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        setLoading(true)
        const [paletteData, existing] = await Promise.all([
          loadPalette(),
          loadFiche(item.id),
        ])
        if (!mounted) return
        setPalette(paletteData || [])

        if (existing) {
          setParfumNormal(existing.parfum_normal || false)
          setTetePosition(existing.tete_position || 'bas')
          setNotePatissier(existing.note_patissier || '')
          if (Array.isArray(existing.lots) && existing.lots.length > 0) {
            setLots(existing.lots)
          } else {
            setLots(initLots(typeGm, isMixte, odooParfums))
          }
        } else {
          setLots(initLots(typeGm, isMixte, odooParfums))
        }
      } catch (e) {
        console.error(e)
        if (mounted) setError(e.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [item?.id, typeGm, isMixte])

  // Init des lots vides : si mixte -> 1 lot par parfum, sinon 1 lot vide
  function initLots(typeGm, isMixte, odooParfums) {
    if (isMixte) {
      const mixteParfums = getMixteParfums(typeGm)
      return mixteParfums.map(p => makeEmptyLot(p))
    }
    if (odooParfums && odooParfums.length === 1 && typeGm !== 'sable' && typeGm !== 'sellou_nougat') {
      return [makeEmptyLot(odooParfums[0])]
    }
    if (odooParfums && odooParfums.length > 0) {
      return odooParfums.map(p => makeEmptyLot(p))
    }
    return [makeEmptyLot(null)]
  }

  // ========== Actions ==========
  function addLot(parfum = null) {
    setLots([...lots, makeEmptyLot(parfum)])
  }

  function updateLot(idx, newLot) {
    const next = [...lots]
    next[idx] = newLot
    setLots(next)
  }

  function deleteLot(idx) {
    setLots(lots.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!parfumNormal && !isLotsValid(lots, expectedQty)) {
      setError(`Le total des lots (${lotsTotal(lots)}) doit être égal à ${expectedQty}`)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const fiche = await saveFiche(item.id, {
        type_gm: typeGm,
        lots: parfumNormal ? [] : lots,
        parfum_normal: parfumNormal,
        tete_position: spec?.hasTetePosition ? tetePosition : null,
        odoo_parfums: odooParfums,
        is_mixte: isMixte,
        note_patissier: notePatissier.trim() || null,
      })
      onSaved && onSaved(fiche)
      onClose && onClose()
    } catch (e) {
      console.error(e)
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ========== Render ==========
  if (!typeGm) {
    return (
      <Backdrop onClose={onClose}>
        <div className="bg-cream rounded-2xl p-6 max-w-md">
          <p className="text-ink mb-4">Type de produit non reconnu : <strong>{productName}</strong></p>
          <button onClick={onClose} className="px-4 py-2 bg-bordeaux text-cream rounded-full">Fermer</button>
        </div>
      </Backdrop>
    )
  }

  if (loading) {
    return (
      <Backdrop onClose={onClose}>
        <div className="bg-cream rounded-2xl p-8">
          <p className="text-ink-mute italic">Chargement...</p>
        </div>
      </Backdrop>
    )
  }

  const total = lotsTotal(lots)
  const isValid = parfumNormal || total === expectedQty

  // Si mixte : grouper les lots par parfum
  const lotsByParfum = isMixte
    ? getMixteParfums(typeGm).map(p => ({
        parfum: p,
        lots: lots.map((l, idx) => ({ lot: l, idx })).filter(({ lot }) => lot.parfum === p),
      }))
    : null

  const expectedQtyPerParfum = isMixte ? expectedQty / 2 : expectedQty

  return (
    <Backdrop onClose={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-line">
        {/* Header */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-5 py-3 flex items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-2">
            <span className="text-[22px]">{TYPE_EMOJIS[typeGm] || '✏️'}</span>
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-bordeaux font-bold uppercase">
                Définir les détails
              </div>
              <div className="font-fraunces italic text-[16px] text-ink leading-tight">
                {TYPE_LABELS[typeGm]} ({expectedQty})
                {isMixte && <span className="text-[12px] text-bordeaux not-italic ml-2">MIXTE</span>}
              </div>
              {taille && (
                <div className="text-[11px] text-ink-mute italic mt-0.5 capitalize">
                  Taille : {taille.toLowerCase()}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux">
            ✕
          </button>
        </div>

        {/* Contenu */}
        <div className="p-5 space-y-4">

          {/* Toggle Couleur / Parfum normal (cupcake) */}
          {spec?.hasParfumNormal && (
            <div className="flex gap-2">
              <button
                onClick={() => setParfumNormal(false)}
                className={`flex-1 px-4 py-2 rounded-full text-[12px] font-medium tracking-wider transition-colors ${
                  !parfumNormal
                    ? 'bg-bordeaux text-cream border border-bordeaux'
                    : 'bg-cream-warm text-ink-mute border border-line'
                }`}
              >
                Couleur
              </button>
              <button
                onClick={() => setParfumNormal(true)}
                className={`flex-1 px-4 py-2 rounded-full text-[12px] font-medium tracking-wider transition-colors ${
                  parfumNormal
                    ? 'bg-bordeaux text-cream border border-bordeaux'
                    : 'bg-cream-warm text-ink-mute border border-line'
                }`}
              >
                Parfum normal
              </button>
            </div>
          )}

          {/* Tete haut/bas (cakepops) */}
          {spec?.hasTetePosition && !parfumNormal && (
            <div>
              <div className="font-mono text-[10px] tracking-wider uppercase text-ink-mute mb-1.5">Tête</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTetePosition('haut')}
                  className={`flex-1 px-3 py-1.5 rounded-full text-[12px] transition-colors ${
                    tetePosition === 'haut'
                      ? 'bg-bordeaux text-cream border border-bordeaux'
                      : 'bg-cream-warm text-ink-mute border border-line'
                  }`}
                >En haut</button>
                <button
                  onClick={() => setTetePosition('bas')}
                  className={`flex-1 px-3 py-1.5 rounded-full text-[12px] transition-colors ${
                    tetePosition === 'bas'
                      ? 'bg-bordeaux text-cream border border-bordeaux'
                      : 'bg-cream-warm text-ink-mute border border-line'
                  }`}
                >En bas</button>
              </div>
            </div>
          )}

          {/* Lots */}
          {!parfumNormal && (
            <>
              {isMixte ? (
                // Mode mixte : 2 sections
                lotsByParfum.map(({ parfum, lots: parfumLots }) => {
                  const parfumTotal = parfumLots.reduce((s, { lot }) => s + (lot.qty || 0), 0)
                  return (
                    <div key={parfum} className="border border-line rounded-lg p-3 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-fraunces italic text-[14px] text-ink font-medium">{parfum}</span>
                        <span className={`text-[11px] font-mono ${parfumTotal === expectedQtyPerParfum ? 'text-success' : 'text-ink-mute'}`}>
                          {parfumTotal} / {expectedQtyPerParfum}
                        </span>
                      </div>
                      {parfumLots.map(({ lot, idx }) => (
                        <LotEditor
                          key={idx}
                          lot={lot}
                          palette={palette}
                          spec={spec}
                          onChange={l => updateLot(idx, l)}
                          onDelete={() => deleteLot(idx)}
                        />
                      ))}
                      <button
                        onClick={() => addLot(parfum)}
                        className="w-full px-3 py-1.5 border border-dashed border-line rounded text-[11px] text-ink-mute hover:bg-cream-warm"
                      >
                        + Ajouter un lot {parfum}
                      </button>
                    </div>
                  )
                })
              ) : (
                // Mode standard : liste de lots
                <div>
                  <div className="font-mono text-[10px] tracking-wider uppercase text-ink-mute mb-2">Lots</div>
                  {lots.map((lot, idx) => (
                    <LotEditor
                      key={idx}
                      lot={lot}
                      palette={palette}
                      spec={spec}
                      onChange={l => updateLot(idx, l)}
                      onDelete={() => deleteLot(idx)}
                      parfumLabel={lot.parfum}
                    />
                  ))}
                  <button
                    onClick={() => addLot(odooParfums[0] || null)}
                    className="w-full px-3 py-2 border border-dashed border-line rounded-lg text-[12px] text-ink-mute hover:bg-cream-warm"
                  >
                    + Ajouter un lot
                  </button>
                </div>
              )}

              {/* Compteur global */}
              <div className={`flex justify-between items-center pt-3 border-t border-line ${isValid ? 'text-success' : 'text-bordeaux'}`}>
                <span className="text-[11px] uppercase tracking-wider font-mono">Total défini</span>
                <span className="font-medium text-[15px]">
                  {total} / {expectedQty}
                </span>
              </div>
            </>
          )}

          {/* Note pâtissier (toujours visible, optionnelle) */}
          <div>
            <div className="font-mono text-[10px] tracking-wider uppercase text-ink-mute mb-1.5">
              Note pour le pâtissier (facultatif)
            </div>
            <textarea
              value={notePatissier}
              onChange={e => setNotePatissier(e.target.value)}
              placeholder="Ex: livrer en boîte cadeau, attention couleur claire, etc."
              rows={2}
              className="w-full px-3 py-2 border border-line rounded-lg bg-cream-warm focus:outline-none focus:border-bordeaux text-[13px] resize-y"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-cream border-t border-line px-5 py-3 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-line rounded-full text-[12px] text-ink-soft hover:bg-cream-warm">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="px-5 py-2 bg-bordeaux text-cream rounded-full text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bordeaux-deep"
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

function Backdrop({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}
