import { useState, useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'
import AppHeader from './AppHeader'
import { loadReglementsAConfirmer, confirmRemiseBoutique } from '../lib/deliveries'
import { toast } from '../lib/toast'

const MOYEN = { espece: '💵 Espèce', cheque: '🧾 Chèque' }
const fmtMoney = n => (Number(n) || 0).toLocaleString('fr-FR')
const frDateTime = s => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d) ? '' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Écran café : confirmer la réception de l'argent/chèque encaissé par le livreur.
export default function ReglementsLivraisonsView({ user, activeView, onNavigate, onLogout }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  async function refresh() {
    setLoading(true)
    try { setRows(await loadReglementsAConfirmer()) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  async function markReceived(r) {
    setBusy(r.order_num)
    try {
      await confirmRemiseBoutique(r.order_num, user.id)
      toast.success('Reçu enregistré ✓')
      await refresh()
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy('') }
  }

  const total = rows.reduce((s, r) => s + (Number(r.regle_montant) || 0), 0)

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView || 'reglements-livraisons'} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-3xl mx-auto p-4">
        <h1 className="font-fraunces italic text-[26px] text-ink mb-1">Règlements livraisons</h1>
        <p className="text-[13px] text-ink-mute mb-5">
          Argent (espèces / chèques) encaissé par le livreur. Coche <b>« Reçu »</b> quand il te l'a remis au café.
        </p>

        {loading ? (
          <div className="text-center py-10 text-ink-mute italic">Chargement…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 bg-cream-warm border border-line rounded-2xl text-ink-soft">
            Rien à confirmer 🎉
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl mb-4 bg-[#E6F1FB] text-[#0C447C] text-[14px]">
              <span>{rows.length} à confirmer</span>
              <span className="font-semibold">{fmtMoney(total)} DH</span>
            </div>

            <div className="flex flex-col gap-2">
              {rows.map(r => (
                <div key={r.order_num} className="bg-white border border-line rounded-xl p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-ink">
                      {r.regle_client || '—'} <span className="text-[11px] text-ink-mute">{r.order_num}</span>
                    </div>
                    <div className="text-[12px] text-ink-soft mt-0.5">
                      {MOYEN[r.moyen_paiement] || r.moyen_paiement}
                      {typeof r.regle_montant === 'number' ? ` · ${fmtMoney(r.regle_montant)} DH` : ''}
                    </div>
                    <div className="text-[11px] text-ink-mute mt-0.5">
                      encaissé par {r.regleur?.full_name || r.regleur?.username || '—'} · {frDateTime(r.regle_at)}
                    </div>
                  </div>
                  <button onClick={() => markReceived(r)} disabled={busy === r.order_num}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium bg-[#27500A] text-white disabled:opacity-50">
                    <CheckCircle2 size={15} /> Reçu
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
