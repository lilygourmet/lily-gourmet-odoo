import { useState, useMemo } from 'react'
import Avatar from '../Avatar'
import WhatsAppLogo from '../WhatsAppLogo'
import { lireFavoris, basculerFavori, joliNumero, lienTel, lienWhatsApp } from '../../lib/annuaire'

// Couleurs de l'app (mêmes valeurs que tailwind.config.js).
const C = {
  cream: '#fcfbf8', creamDeep: '#f1eadd', ink: '#1a0f0a', soft: '#4a3a30',
  mute: '#8a7a70', line: '#e5d8c3', bordeaux: '#993556', green: '#2f6b2f', greenBg: '#eaf3de',
}

const groupeDe = c => c.groupe || 'Autres'

// Liste visuelle : recherche, filtres par équipe, favoris, bouton d'appel.
// Sert à la fois à la page publique et à l'onglet admin.
export default function AnnuaireListe({ contacts }) {
  const [favoris, setFavoris] = useState(lireFavoris)
  // On ouvre sur les favoris… sauf s'il n'y en a aucun (sinon page vide).
  const [filtre, setFiltre] = useState(() => (lireFavoris().size ? 'favoris' : 'tous'))
  const [q, setQ] = useState('')

  const groupes = useMemo(
    () => [...new Set(contacts.map(groupeDe))].sort((a, b) => a.localeCompare(b, 'fr')),
    [contacts],
  )

  const recherche = q.trim().toLowerCase()
  const visibles = contacts
    .filter(c => !recherche || `${c.nom} ${c.poste || ''} ${groupeDe(c)}`.toLowerCase().includes(recherche))
    .filter(c => filtre === 'tous' || filtre === 'favoris' || groupeDe(c) === filtre)
    .filter(c => filtre !== 'favoris' || favoris.has(c.id))
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))

  function carte(c) {
    const tel = lienTel(c.telephone)
    const wa = lienWhatsApp(c.telephone)
    // Nom en haut, boutons d'appel en dessous sur toute la largeur : sur un
    // téléphone étroit, le bouton WhatsApp passait sinon à la ligne tout seul.
    return (
      <div key={c.id} style={{
        display: 'flex', flexDirection: 'column', gap: 10, background: '#fff',
        border: `1px solid ${C.line}`, borderRadius: 18, padding: '11px 12px',
        boxShadow: '0 2px 8px rgba(80,40,30,.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar emp={c} size={52} />
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{c.nom}</div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>
              {[c.poste, c.groupe].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <button
            onClick={() => setFavoris(f => basculerFavori(c.id, f))}
            aria-label={favoris.has(c.id) ? 'Retirer des favoris' : 'Mettre en favori'}
            style={{
              flex: '0 0 auto', border: 'none', background: 'transparent', fontSize: 23, lineHeight: 1,
              cursor: 'pointer', padding: 4,
              filter: favoris.has(c.id) ? 'none' : 'grayscale(1)', opacity: favoris.has(c.id) ? 1 : 0.32,
            }}
          >⭐</button>
        </div>

        {tel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href={tel} style={{
              flex: '1 1 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '11px 12px', borderRadius: 999, background: C.greenBg, color: C.green,
              fontWeight: 800, fontSize: 15, textDecoration: 'none', border: '1px solid #cfe3bd',
              fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            }}>📞 {joliNumero(c.telephone)}</a>
            <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.nom}`} title="WhatsApp" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: 999, background: '#25D366', color: '#fff',
              textDecoration: 'none', flex: '0 0 auto',
            }}><WhatsAppLogo size={23} /></a>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: C.mute, fontStyle: 'italic' }}>pas encore de numéro</span>
        )}
      </div>
    )
  }

  function titreSection(texte, n) {
    return (
      <div key={'t-' + texte} style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800,
        letterSpacing: '.09em', textTransform: 'uppercase', color: C.mute, marginTop: 6,
      }}>{texte}<span style={{ marginLeft: 'auto', letterSpacing: 0 }}>{n}</span></div>
    )
  }

  // Vue « Tous » sans recherche : les favoris d'abord, puis chaque équipe.
  let corps
  if (!visibles.length) {
    corps = (
      <div style={{ textAlign: 'center', color: C.mute, fontSize: 14, padding: '36px 20px', lineHeight: 1.5 }}>
        {filtre === 'favoris'
          ? <>Aucun favori pour l’instant.<br />Touche l’étoile ⭐ d’une personne.</>
          : 'Personne ne correspond.'}
      </div>
    )
  } else if (filtre === 'tous' && !recherche) {
    const enFavori = visibles.filter(c => favoris.has(c.id))
    const reste = visibles.filter(c => !favoris.has(c.id))
    corps = [
      ...(enFavori.length ? [titreSection('⭐ Favoris', enFavori.length), ...enFavori.map(carte)] : []),
      ...groupes.flatMap(g => {
        const dedans = reste.filter(c => groupeDe(c) === g)
        return dedans.length ? [titreSection(g, dedans.length), ...dedans.map(carte)] : []
      }),
    ]
  } else {
    corps = visibles.map(carte)
  }

  const chips = [{ id: 'tous', label: 'Tous' }, { id: 'favoris', label: '⭐ Favoris' },
    ...groupes.map(g => ({ id: g, label: g }))]

  return (
    <div>
      <input
        value={q} onChange={e => setQ(e.target.value)} type="search"
        placeholder="🔍  Chercher un nom, un poste…" aria-label="Chercher"
        style={{
          width: '100%', padding: '12px 14px', fontSize: 16, borderRadius: 14,
          border: `1px solid ${C.line}`, background: '#fff', color: C.ink, outline: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '11px 0 2px' }}>
        {chips.map(c => (
          <button key={c.id} onClick={() => setFiltre(c.id)} style={{
            flex: '0 0 auto', padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap',
            border: `1px solid ${filtre === c.id ? C.bordeaux : C.line}`,
            background: filtre === c.id ? C.bordeaux : '#fff',
            color: filtre === c.id ? '#fff' : C.soft,
          }}>{c.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>{corps}</div>
    </div>
  )
}
