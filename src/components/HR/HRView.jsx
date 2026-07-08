import { useState, useEffect } from 'react'
import { usePersistedState } from '../../lib/usePersistedState'
import { Building2, Users, FileText, Clock, Wallet, Receipt, Palmtree, KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import AttestationsTab from './AttestationsTab'
import AccesLocauxTab from './AccesLocauxTab'
import EmployesTab from './EmployesTab'
import PointageTab from './PointageTab'
import SalairesTab from './SalairesTab'
import BulletinsTab from './BulletinsTab'
import CongesView from '../CongesView'

/**
 * Vue principale HR — menu en colonne à gauche (sections), contenu à droite.
 * Congés est intégré ici (plus d'onglet séparé en haut).
 * - admin : accès complet (avec Salaires / Bulletins)
 * - perm_hr : accès limité
 */
export default function HRView({ user, deep }) {
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = usePersistedState('lily.hr.tab', 'employes')
  // Ouverture d'un sous-onglet précis depuis le menu de gauche.
  useEffect(() => { if (deep?.tab) setTab(deep.tab) }, [deep])

  // Mobile : la colonne gauche devient une rangée horizontale en haut.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const h = e => setIsMobile(e.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])
  // Sur ordi/tablette (≥768px) la bande de gauche gère la navigation → on cache le menu interne.
  const [sidebarActive, setSidebarActive] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const h = e => setSidebarActive(e.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])

  // Badge Congés (demandes + allocations en attente)
  const [congesBadge, setCongesBadge] = useState(0)
  useEffect(() => {
    if (!(isAdmin || user?.perm_hr)) return
    let off = false
    ;(async () => {
      try {
        const [{ count: c1 }, { count: c2 }] = await Promise.all([
          supabase.from('conges').select('id', { count: 'exact', head: true }).eq('statut', 'demande'),
          supabase.from('conges_allocations').select('id', { count: 'exact', head: true }).eq('statut', 'attente'),
        ])
        if (!off) setCongesBadge((c1 || 0) + (c2 || 0))
      } catch (e) { /* ignore */ }
    })()
    return () => { off = true }
  }, [isAdmin, user?.perm_hr, tab])

  const sections = [
    { key: 'employes',     label: 'Employés',     Icon: Users },
    { key: 'attestations', label: 'Attestations', Icon: FileText },
    { key: 'pointage',     label: 'Pointage',     Icon: Clock },
    { key: 'conges',       label: 'Congés',       Icon: Palmtree, badge: congesBadge },
    { key: 'acces',        label: 'Accès locaux', Icon: KeyRound },
    isAdmin && { key: 'salaires',  label: 'Salaires',         Icon: Wallet },
    isAdmin && { key: 'bulletins', label: 'Bulletins de paie', Icon: Receipt },
  ].filter(Boolean)

  // Titre = section où on se trouve (ex. « Pointage »). Sur ordi, la bande de
  // gauche gère la nav, donc le titre indique l'endroit ; sur téléphone on garde « RH ».
  const cur = sections.find(s => s.key === tab) || { label: 'Ressources Humaines', Icon: Building2 }
  const TitleIcon = cur.Icon
  const title = cur.label

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '1rem 0.75rem' : '1.25rem' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <TitleIcon size={22} /> {title} {!isAdmin && <span style={{ fontSize: 12, color: '#8a7a70', fontWeight: 400, fontStyle: 'normal', fontFamily: 'Geist, sans-serif' }}>(accès limité)</span>}
        </h2>
      </div>

      {(() => {
      const content = (
        <div style={{ minWidth: 0 }}>
          {tab === 'employes'     && <EmployesTab user={user} isAdmin={isAdmin} />}
          {tab === 'attestations' && <AttestationsTab user={user} isAdmin={isAdmin} />}
          {tab === 'pointage'     && <PointageTab user={user} isAdmin={isAdmin} />}
          {tab === 'conges'       && <CongesView user={user} embedded congesTab={deep?.tab === 'conges' ? deep?.ctab : null} />}
          {tab === 'acces'        && <AccesLocauxTab user={user} isAdmin={isAdmin} />}
          {tab === 'salaires'     && isAdmin && <SalairesTab user={user} />}
          {tab === 'bulletins'    && isAdmin && <BulletinsTab />}
        </div>
      )
      // Sur ordi/tablette : la bande de gauche gère la navigation → contenu seul.
      if (sidebarActive) return content
      // Téléphone : menu (rangée) + contenu.
      return (
      <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : '210px 1fr', gap: isMobile ? 0 : 20, alignItems: 'start' }}>
        {/* Menu vignettes */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          gap: 6,
          overflowX: isMobile ? 'auto' : 'visible',
          marginBottom: isMobile ? 16 : 0,
          padding: isMobile ? '0 0 4px' : 12,
          background: isMobile ? 'transparent' : '#F7F2EA',
          border: isMobile ? 'none' : '0.5px solid #e5d8c3',
          borderRadius: isMobile ? 0 : 14,
          position: isMobile ? 'static' : 'sticky', top: 12,
        }}>
          {sections.map(s => {
            const active = tab === s.key
            return (
              <button key={s.key} onClick={() => setTab(s.key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '11px 13px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                whiteSpace: 'nowrap', flexShrink: 0,
                border: '1px solid transparent',
                background: active ? '#993556' : (isMobile ? 'white' : 'transparent'),
                color: active ? '#faf7f2' : '#4a3a30',
                borderColor: active ? '#993556' : (isMobile ? '#e5d8c3' : 'transparent'),
              }}>
                <s.Icon size={17} strokeWidth={1.8} />
                <span>{s.label}</span>
                {s.badge > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999,
                    background: active ? 'rgba(255,255,255,0.25)' : '#FCE9E8',
                    color: active ? '#fff' : '#99201E',
                  }}>{s.badge}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Contenu */}
        {content}
      </div>
      )
      })()}
    </div>
  )
}
