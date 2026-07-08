import { useState, useEffect } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Wallet, ExternalLink, Car, HandCoins, ShoppingCart } from 'lucide-react'
import AppHeader from '../AppHeader'
import AjoutSortieModal from './modals/AjoutSortieModal'
import AjoutEntreeModal from './modals/AjoutEntreeModal'
import { loadCaisseBalance, loadCategories, loadMouvementsMonth, addMouvement } from '../../lib/caisse'
import { fmtMoney, fmtDateCourte, currentMonth, currentYear } from './_helpers'
import { toast } from '../../lib/toast'

// Mini-écran « caisse rapide » pour Meriem : 2 gros boutons Entrée / Sortie,
// pensé pour le téléphone (lien direct ?view=caisse-rapide). Réutilise les
// fenêtres d'ajout et la fonction addMouvement existantes.
export default function CaisseRapide({ user, onNavigate, onLogout }) {
  const canUse = !!(user?.perm_caisse || user?.perm_caisse_admin || user?.role === 'admin')
  const [balance, setBalance] = useState(0)
  const [categories, setCategories] = useState([])
  const [recent, setRecent] = useState([])
  const [showSortie, setShowSortie] = useState(false)
  const [showEntree, setShowEntree] = useState(false)

  async function reload() {
    const [bal, mvts] = await Promise.all([
      loadCaisseBalance('meriem'),
      loadMouvementsMonth('meriem', currentYear(), currentMonth()),
    ])
    setBalance(bal)
    setRecent(mvts.slice(0, 6))
  }

  useEffect(() => { if (canUse) { reload(); loadCategories('meriem').then(setCategories) } }, [canUse])

  async function handleAddSortie({ amount, label, category, mvtDate, hasFacture }) {
    await addMouvement({ caisseOwner: 'meriem', type: 'sortie', sourceType: 'manuelle', amount, label, category, mvtDate, hasFacture, userId: user.id })
    setShowSortie(false); toast.success('Sortie enregistrée'); reload()
  }
  async function handleAddEntree({ amount, label, mvtDate }) {
    await addMouvement({ caisseOwner: 'meriem', type: 'entree', sourceType: 'manuelle', amount, label, mvtDate, userId: user.id })
    setShowEntree(false); toast.success('Entrée enregistrée'); reload()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fcfbf8' }}>
      <AppHeader user={user} activeView="caisse" onNavigate={onNavigate} onLogout={onLogout} />

      {!canUse ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#4a3a30' }}>Accès réservé à la caisse.</div>
      ) : (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.25rem 1rem 2.5rem' }}>
        {/* Solde */}
        <div style={{ background: 'linear-gradient(135deg, #993556 0%, #B14A6F 100%)', color: 'white', padding: '1.5rem 1.25rem', borderRadius: 16, marginBottom: 22 }}>
          <div style={{ fontSize: 13, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Wallet size={15} /> Caisse Meriem · solde</div>
          <div style={{ fontSize: 40, fontWeight: 500, marginTop: 6 }}>{fmtMoney(balance)}</div>
        </div>

        {/* 2 gros boutons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowEntree(true)} style={bigBtn('#E1F5EE', '#1D7A5C', '#085041')}>
            <ArrowDownCircle size={34} />
            <span>Entrée</span>
            <span style={subLabel}>argent reçu</span>
          </button>
          <button onClick={() => setShowSortie(true)} style={bigBtn('#FCE9E8', '#C0392B', '#99201E')}>
            <ArrowUpCircle size={34} />
            <span>Sortie</span>
            <span style={subLabel}>argent dépensé</span>
          </button>
        </div>

        {/* Raccourcis vers les autres parties de la caisse */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
          <button onClick={() => onNavigate('caisse', { caisseSub: 'hamid' })} style={shortcutBtn}>
            <Car size={22} /><span>Hamid</span>
          </button>
          <button onClick={() => onNavigate('caisse', { caisseSub: 'avances' })} style={shortcutBtn}>
            <HandCoins size={22} /><span>Avances</span>
          </button>
          <button onClick={() => onNavigate('caisse', { caisseSub: 'courses' })} style={shortcutBtn}>
            <ShoppingCart size={22} /><span>Courses</span>
          </button>
        </div>

        {/* Derniers mouvements */}
        <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 8, fontWeight: 500 }}>Derniers mouvements</div>
        {recent.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8a7a70', background: '#F9F6F1', borderRadius: 12, fontSize: 13 }}>Aucun mouvement ce mois.</div>}
        {recent.map(mvt => (
          <div key={mvt.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3', borderLeft: `3px solid ${mvt.type === 'entree' ? '#97C459' : '#E5C0B6'}` }}>
            <div style={{ fontSize: 11, color: '#8a7a70', width: 52, flexShrink: 0 }}>{fmtDateCourte(mvt.mvt_date)}</div>
            <div style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mvt.label}</div>
            <div style={{ fontWeight: 500, fontSize: 14, color: mvt.type === 'entree' ? '#1D7A5C' : '#99201E', whiteSpace: 'nowrap' }}>
              {mvt.type === 'entree' ? '+ ' : '− '}{fmtMoney(Math.abs(mvt.amount)).replace(' dh', '')}
            </div>
          </div>
        ))}

        <button onClick={() => onNavigate('caisse')} style={{ marginTop: 18, width: '100%', padding: '11px', borderRadius: 10, border: '1px solid #e5d8c3', background: 'white', color: '#4a3a30', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ExternalLink size={15} /> Ouvrir la caisse complète
        </button>
      </div>
      )}

      {showSortie && (
        <AjoutSortieModal categories={categories} caisseOwner="meriem" onClose={() => setShowSortie(false)} onSubmit={handleAddSortie} />
      )}
      {showEntree && (
        <AjoutEntreeModal onClose={() => setShowEntree(false)} onSubmit={handleAddEntree} />
      )}
    </div>
  )
}

function bigBtn(bg, border, text) {
  return {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '26px 12px', borderRadius: 16, cursor: 'pointer',
    background: bg, border: `1px solid ${border}`, color: text,
    fontSize: 19, fontWeight: 600,
  }
}
const subLabel = { fontSize: 11, fontWeight: 400, opacity: 0.8 }
const shortcutBtn = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '16px 8px', borderRadius: 14, cursor: 'pointer',
  background: 'white', border: '1px solid #e5d8c3', color: '#993556',
  fontSize: 13, fontWeight: 500,
}
