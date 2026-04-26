import { useState, useEffect } from 'react'
import {
  loadPalette,
  createColor,
  updateColor,
  deleteColor,
  FAMILLES,
} from '../lib/palette'

export default function AdminGmConfig({ onClose }) {
  const [colors, setColors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  // Form state
  const [formNom, setFormNom] = useState('')
  const [formHex, setFormHex] = useState('#f5d0d8')
  const [formFamille, setFormFamille] = useState('rose')
  const [formInPrincipale, setFormInPrincipale] = useState(true)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const data = await loadPalette()
      setColors(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function startNew() {
    setEditingId(null)
    setFormNom('')
    setFormHex('#f5d0d8')
    setFormFamille('rose')
    setFormInPrincipale(true)
    setShowNewForm(true)
  }

  function startEdit(c) {
    setEditingId(c.id)
    setFormNom(c.nom)
    setFormHex(c.hex)
    setFormFamille(c.famille)
    setFormInPrincipale(c.in_principale)
    setShowNewForm(true)
  }

  function cancelForm() {
    setShowNewForm(false)
    setEditingId(null)
    setError('')
  }

  async function handleSave() {
    if (!formNom.trim()) {
      setError('Le nom est requis')
      return
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(formHex)) {
      setError('Code hex invalide (ex: #f5d0d8)')
      return
    }
    setError('')
    try {
      if (editingId) {
        await updateColor(editingId, {
          nom: formNom.trim(),
          hex: formHex,
          famille: formFamille,
          in_principale: formInPrincipale,
        })
      } else {
        await createColor({
          nom: formNom.trim(),
          hex: formHex,
          famille: formFamille,
          in_principale: formInPrincipale,
        })
      }
      cancelForm()
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(c) {
    if (!confirm(`Supprimer la couleur "${c.nom}" ?`)) return
    try {
      await deleteColor(c.id)
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  // Grouper par famille
  const byFamille = {}
  for (const c of colors) {
    if (!byFamille[c.famille]) byFamille[c.famille] = []
    byFamille[c.famille].push(c)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
         onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl border border-line"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-semibold mb-1">
              CONFIGURATION GM
            </div>
            <div className="font-fraunces italic text-[22px] font-medium text-ink leading-tight">
              Palette de couleurs
            </div>
          </div>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
                  title="Fermer">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {error && (
            <div className="text-[12px] text-bordeaux bg-bordeaux/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          {!showNewForm && (
            <button onClick={startNew}
                    className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all">
              + Ajouter une couleur
            </button>
          )}

          {showNewForm && (
            <div className="bg-white border border-line rounded-xl p-4 space-y-3">
              <div className="font-fraunces italic text-[16px] text-ink">
                {editingId ? 'Modifier la couleur' : 'Nouvelle couleur'}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium">Nom</label>
                  <input type="text" value={formNom} onChange={e => setFormNom(e.target.value)}
                         placeholder="Rose poudre"
                         className="mt-1 w-full px-3 py-2 border border-line rounded-md text-[13px] focus:border-bordeaux outline-none bg-white" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium">Famille</label>
                  <select value={formFamille} onChange={e => setFormFamille(e.target.value)}
                          className="mt-1 w-full px-3 py-2 border border-line rounded-md text-[13px] focus:border-bordeaux outline-none bg-white">
                    {FAMILLES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium">Couleur</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="color" value={formHex} onChange={e => setFormHex(e.target.value)}
                           className="w-12 h-9 rounded border border-line cursor-pointer" />
                    <input type="text" value={formHex} onChange={e => setFormHex(e.target.value)}
                           className="flex-1 px-3 py-2 border border-line rounded-md text-[13px] focus:border-bordeaux outline-none bg-white font-mono" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <input type="checkbox" id="inPrincipale" checked={formInPrincipale}
                         onChange={e => setFormInPrincipale(e.target.checked)}
                         className="w-4 h-4 accent-bordeaux" />
                  <label htmlFor="inPrincipale" className="text-[12px] text-ink-soft">
                    Dans la palette principale
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={handleSave}
                        className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all">
                  {editingId ? 'Enregistrer' : 'Ajouter'}
                </button>
                <button onClick={cancelForm}
                        className="px-4 py-2 border border-line text-ink-mute rounded-full text-[11px] font-medium tracking-wider hover:bg-line/30 transition-all">
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Liste groupee par famille */}
          {loading ? (
            <div className="text-center py-8 text-ink-mute text-[12px]">Chargement...</div>
          ) : (
            <div className="space-y-4">
              {FAMILLES.map(f => {
                const list = byFamille[f.value] || []
                if (list.length === 0) return null
                return (
                  <div key={f.value}>
                    <div className="text-[10px] uppercase tracking-wider text-ink-mute font-medium mb-2">
                      {f.label}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {list.map(c => (
                        <div key={c.id}
                             className="bg-white border border-line rounded-lg px-3 py-2 flex items-center gap-3">
                          <span className="w-7 h-7 rounded-full border border-line flex-shrink-0"
                                style={{ background: c.hex }}></span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-ink font-medium truncate">{c.nom}</div>
                            <div className="text-[10px] text-ink-mute font-mono">{c.hex}</div>
                          </div>
                          {c.in_principale && (
                            <span className="text-[8px] font-bold text-bordeaux bg-bordeaux/10 px-1.5 py-0.5 rounded tracking-wider uppercase">
                              Principale
                            </span>
                          )}
                          <button onClick={() => startEdit(c)}
                                  className="w-7 h-7 rounded-full text-ink-mute hover:bg-line/30 flex items-center justify-center transition-all"
                                  title="Modifier">
                            ✏️
                          </button>
                          <button onClick={() => handleDelete(c)}
                                  className="w-7 h-7 rounded-full text-ink-mute hover:bg-bordeaux hover:text-cream flex items-center justify-center transition-all"
                                  title="Supprimer">
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
