import { useState, useEffect } from 'react'
import { todayISO } from '../lib/dates'
import { Plus, Check, Printer } from 'lucide-react'
import AppHeader from './AppHeader'
import { toast } from '../lib/toast'
import { MATIERES, loadTransferts, addTransfert, confirmTransfert } from '../lib/transfertsMp'

// 3,8 plutôt que 3.8 ; masque les décimales inutiles (5 kg, pas 5,0).
const fmt = n => (Number(n) || 0).toString().replace('.', ',')
const frDate = iso => { const [y, m, d] = (iso || '').split('-'); return d ? `${d}/${m}` : iso }

export default function TransfertsMpView({ user, activeView, onNavigate, onLogout }) {
  const isAdmin = user?.role === 'admin'
  const canSend = isAdmin || user?.perm_transfert_annexe === true
  const canConfirm = isAdmin || user?.perm_transfert_boutique === true

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ matiere: MATIERES[0], qty: '', date: todayISO() })
  const [filterDate, setFilterDate] = useState('')   // '' = tout l'historique

  async function refresh() {
    setLoading(true)
    try { setRows(await loadTransferts()) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  async function send() {
    if (!(Number(f.qty) > 0)) { toast.error('Quantité invalide.'); return }
    setBusy(true)
    try {
      await addTransfert({ matiere: f.matiere, qty: f.qty, date: f.date, user })
      setF({ matiere: MATIERES[0], qty: '', date: todayISO() })
      toast.success('Transfert envoyé à la boutique.')
      await refresh()
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  async function confirm(t) {
    const val = prompt(`Quantité reçue de « ${t.matiere} » ? (envoyé : ${fmt(t.qty_envoye)} kg)`, fmt(t.qty_envoye).replace(',', '.'))
    if (val === null) return
    const n = Number(val)
    if (!(n >= 0)) { toast.error('Quantité invalide.'); return }
    try { await confirmTransfert(t.id, n, user); await refresh() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  const pending = rows.filter(r => r.statut === 'en_attente')
  // Journal filtré par date (si une date est choisie), sinon tout l'historique.
  const journal = filterDate ? rows.filter(r => (r.transfer_date || '').slice(0, 10) === filterDate) : rows

  // Imprime le journal (filtré si une date est choisie) → dialogue d'impression du navigateur.
  function printTransferts() {
    const w = window.open('', '_blank')
    if (!w) { toast.error('Autorise les pop-ups pour imprimer.'); return }
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const titre = filterDate ? `Transferts du ${frDate(filterDate)}` : 'Journal complet'
    const trs = journal.map(t => {
      const recu = t.statut === 'recu' ? `${fmt(t.qty_recu)} kg` : '—'
      const statut = t.statut === 'recu' ? 'Reçu' : 'En attente'
      return `<tr><td>${frDate(t.transfer_date)}</td><td>${esc(t.matiere)}</td><td>${fmt(t.qty_envoye)} kg</td><td>${recu}</td><td>${esc(t.envoye_par || '—')}</td><td>${statut}</td></tr>`
    }).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Transferts MP</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#1a0f0a}
        h1{font-size:20px;margin:0 0 4px}
        .sub{font-size:12px;color:#666;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
        th{background:#f3efe9;font-size:11px;text-transform:uppercase}
      </style></head><body>
      <h1>Transferts matières premières — ${titre}</h1>
      <p class="sub">Prod annexe → prod boutique · imprimé le ${new Date().toLocaleString('fr-FR')}</p>
      <table><thead><tr><th>Date</th><th>Matière</th><th>Envoyé</th><th>Reçu</th><th>Par</th><th>Statut</th></tr></thead>
      <tbody>${trs}</tbody></table>
      </body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView || 'transferts-mp'} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-3xl mx-auto p-4">
        <h1 className="font-fraunces italic text-[26px] text-ink mb-1">Transferts matières premières</h1>
        <p className="text-[13px] text-ink-mute mb-5">Envois de la <b>prod annexe</b> vers la <b>prod boutique</b> — quantités en kg.</p>

        {loading ? <div className="text-center py-10 text-ink-mute italic">Chargement…</div> : (<>

          {/* ---- ENVOYER (annexe) ---- */}
          {canSend && (
            <div className="bg-cream-warm border border-line rounded-2xl p-4 mb-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-3">Envoyer un transfert</h2>
              <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">Matière</label>
                  <select value={f.matiere} onChange={e => setF({ ...f, matiere: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white">
                    {MATIERES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">Quantité (kg)</label>
                  <input type="number" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} placeholder="5" className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                </div>
                <div className="w-36">
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">Date</label>
                  <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                </div>
                <button onClick={send} disabled={busy} className="inline-flex items-center justify-center gap-1 px-4 py-2 text-[13px] font-medium bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all disabled:opacity-50">
                  <Plus size={14} /> Envoyer
                </button>
              </div>
            </div>
          )}

          {/* ---- À CONFIRMER (boutique) ---- */}
          {canConfirm && (
            <div className="mb-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">
                À confirmer{pending.length > 0 && <span className="text-bordeaux"> ({pending.length})</span>}
              </h2>
              {pending.length === 0 ? (
                <div className="text-[13px] text-ink-mute italic bg-white border border-line rounded-2xl px-3 py-5 text-center">Rien à confirmer. 🎉</div>
              ) : (
                <div className="bg-white border border-line rounded-2xl overflow-hidden">
                  {pending.map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-line last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium text-ink">{t.matiere} <span className="text-bordeaux font-semibold">{fmt(t.qty_envoye)} kg</span></div>
                        <div className="text-[11px] text-ink-mute">envoyé par {t.envoye_par || '—'} · {frDate(t.transfer_date)}</div>
                      </div>
                      <button onClick={() => confirm(t)} className="flex-shrink-0 inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 border border-bordeaux text-bordeaux rounded-lg hover:bg-bordeaux hover:text-cream transition-all">
                        <Check size={13} /> Confirmer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---- JOURNAL ---- */}
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Journal des transferts</h2>
            <div className="flex items-center gap-2">
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                className="px-2 py-1.5 border border-line rounded-lg text-[12px] bg-white" />
              {filterDate && (
                <button onClick={() => setFilterDate('')} className="text-[12px] text-ink-mute hover:text-bordeaux">Tout</button>
              )}
              {journal.length > 0 && (
                <button onClick={printTransferts} className="inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 border border-line text-ink-soft rounded-lg hover:border-bordeaux hover:text-bordeaux transition-all">
                  <Printer size={13} /> Imprimer
                </button>
              )}
            </div>
          </div>
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            {journal.length === 0 ? (
              <div className="text-center py-6 text-ink-mute italic text-[13px]">{filterDate ? 'Aucun transfert ce jour-là.' : "Aucun transfert pour l'instant."}</div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-ink-mute bg-cream-warm">
                    <th className="text-left font-semibold px-3 py-2">Date</th>
                    <th className="text-left font-semibold px-3 py-2">Matière</th>
                    <th className="text-left font-semibold px-3 py-2">Envoyé</th>
                    <th className="text-left font-semibold px-3 py-2">Reçu</th>
                    <th className="text-left font-semibold px-3 py-2">Par</th>
                    <th className="text-left font-semibold px-3 py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.map(t => {
                    const diff = t.statut === 'recu' ? Number(t.qty_recu) - Number(t.qty_envoye) : 0
                    return (
                      <tr key={t.id} className="border-t border-line">
                        <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{frDate(t.transfer_date)}</td>
                        <td className="px-3 py-2 text-ink">{t.matiere}</td>
                        <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{fmt(t.qty_envoye)} kg</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {t.statut === 'recu'
                            ? <span className="font-medium text-ink">{fmt(t.qty_recu)} kg{diff !== 0 && <span className="text-bordeaux text-[11px]"> ({diff > 0 ? '+' : ''}{fmt(diff)})</span>}</span>
                            : <span className="text-ink-mute">—</span>}
                        </td>
                        <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{t.envoye_par || '—'}</td>
                        <td className="px-3 py-2">
                          {t.statut === 'recu'
                            ? <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Reçu</span>
                            : <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">En attente</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>)}
      </div>
    </div>
  )
}
