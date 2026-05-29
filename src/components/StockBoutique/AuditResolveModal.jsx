// src/components/StockBoutique/AuditResolveModal.jsx
// Modal d'arbitrage d'écart par l'équipe audit.
// 3 options : "Patissier a raison", "Café a raison", "Corriger les quantités"
// + note libre optionnelle
// =============================================================

import { useState } from 'react'

export default function AuditResolveModal({ item, onClose, onResolve, onOverrideQty }) {
  const [choice, setChoice] = useState(null) // 'patissier' | 'cafe' | 'modify'
  const [newAnnounced, setNewAnnounced] = useState(item.qty_announced ?? item.qty_morning ?? 0)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const qtyAnnounced = item.qty_announced ?? item.qty_morning ?? 0
  const qtyReceived = item.qty_received ?? item.qty_counted ?? 0
  const qtyOdoo = item.qty_odoo_current ?? item.qty_odoo_snapshot
  const gap = qtyOdoo !== null && qtyOdoo !== undefined ? qtyOdoo - qtyReceived : null
  const patissierMsg = item.discrepancy_patissier_message

  async function handleConfirm() {
    if (!choice) {
      setError('Choisis une option')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (choice === 'modify') {
        await onOverrideQty(item.id, {
          qty_announced: parseInt(newAnnounced, 10),
        }, note.trim() || null)
      } else {
        await onResolve(item.id, choice, note.trim() || null)
      }
      onClose()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-bordeaux text-cream px-4 py-3 flex-shrink-0">
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase opacity-90">
            Trancher l'écart
          </div>
          <div className="font-semibold text-[13px] mt-0.5">{item.product_name}</div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Contexte */}
          <div className="bg-cream-warm rounded-md p-3 mb-3 text-[12px] space-y-1">
            <div className="flex justify-between">
              <span>Hamza a envoyé :</span>
              <strong className="tabular-nums">{qtyAnnounced}</strong>
            </div>
            <div className="flex justify-between">
              <span>Café a compté :</span>
              <strong className="tabular-nums text-red-700">{qtyReceived}</strong>
            </div>
            {qtyOdoo !== null && qtyOdoo !== undefined && (
              <div className="flex justify-between">
                <span>Odoo actuel :</span>
                <strong className="tabular-nums text-blue-700">{qtyOdoo}</strong>
              </div>
            )}
            {gap !== null && (
              <div className="flex justify-between border-t border-line pt-1 mt-1">
                <span>Écart actuel :</span>
                <strong className={`tabular-nums ${gap > 0 ? 'text-red-700' : gap < 0 ? 'text-blue-700' : 'text-green-700'}`}>
                  {gap > 0 ? '+' : ''}{gap}
                </strong>
              </div>
            )}
          </div>

          {/* Messages */}
          {patissierMsg && (
            <div className="bg-red-50 border-l-[3px] border-red-400 px-3 py-2 mb-2 text-[11px] italic text-red-900">
              Hamza : "{patissierMsg}"
            </div>
          )}
          {item.reception_note && (
            <div className="bg-amber-50 border-l-[3px] border-amber-400 px-3 py-2 mb-3 text-[11px] italic text-amber-900">
              Café : "{item.reception_note}"
            </div>
          )}

          {/* Options */}
          <div className="text-[10px] uppercase tracking-wider text-ink-mute mb-2 mt-3 font-mono">
            Ta décision :
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setChoice('patissier')}
              className={`text-left px-3 py-2.5 rounded-md border text-[12px] ${
                choice === 'patissier'
                  ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300'
                  : 'bg-white border-line hover:bg-cream-warm'
              }`}
            >
              <div className="font-semibold">✓ Patissier a raison</div>
              <div className="text-[10px] text-ink-mute mt-0.5">
                Apporté reste {qtyAnnounced}, marqué "erreur café"
              </div>
            </button>

            <button
              type="button"
              onClick={() => setChoice('cafe')}
              className={`text-left px-3 py-2.5 rounded-md border text-[12px] ${
                choice === 'cafe'
                  ? 'bg-red-50 border-red-400 ring-2 ring-red-300'
                  : 'bg-white border-line hover:bg-cream-warm'
              }`}
            >
              <div className="font-semibold">✓ Café a raison</div>
              <div className="text-[10px] text-ink-mute mt-0.5">
                Apporté devient {qtyReceived} (la valeur reçue par café)
              </div>
            </button>

            <button
              type="button"
              onClick={() => setChoice('modify')}
              className={`text-left px-3 py-2.5 rounded-md border text-[12px] ${
                choice === 'modify'
                  ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-300'
                  : 'bg-white border-line hover:bg-cream-warm'
              }`}
            >
              <div className="font-semibold">Corriger l'apporté</div>
              <div className="text-[10px] text-ink-mute mt-0.5 mb-2">
                Saisis la vraie quantité apportée
              </div>
              {choice === 'modify' && (
                <div className="mt-2 max-w-[120px]">
                  <label className="block text-[9px] uppercase tracking-wider text-ink-mute mb-1">
                    Nouvelle qty apportée
                  </label>
                  <input
                    type="number"
                    value={newAnnounced}
                    onChange={(e) => setNewAnnounced(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 border border-line rounded text-center text-[13px] tabular-nums"
                  />
                </div>
              )}
            </button>
          </div>

          {/* Note */}
          <div className="mt-4">
            <label className="block text-[11px] text-ink-mute mb-1">
              Note audit (optionnel)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: vérifié frigo, 2 gâteaux retrouvés derrière..."
              rows={2}
              className="w-full px-2 py-1.5 border border-line rounded text-[11px]"
            />
          </div>

          {error && (
            <div className="mt-3 px-3 py-2 bg-red-50 border border-red-300 rounded text-[11px] text-red-900">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-cream-warm border-t border-line px-4 py-3 flex justify-between flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-1.5 bg-white border border-line rounded-md text-[11px] hover:bg-cream-warm disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !choice}
            className="px-4 py-1.5 bg-bordeaux text-cream rounded-md text-[11px] font-medium hover:bg-bordeaux-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Validation...' : 'Trancher'}
          </button>
        </div>
      </div>
    </div>
  )
}

