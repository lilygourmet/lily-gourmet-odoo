import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { loadOcpFactureData, saveOcpFacture } from '../lib/ocp'
import { toast } from '../lib/toast'

// Facture mensuelle OCP : reprend les commandes confirmées non encore facturées
// sur une période, une section par événement, tout modifiable, totaux recalculés
// à chaque frappe. Rien n'est écrit dans Odoo ; l'app mémorise seulement quelles
// commandes sont parties sur quelle facture (table ocp_factures).
const B = '#7a1f3d', LINE = '#e7dccb', SOFT = '#6b5f57'
const CLI_KEY = 'ocp_facture_client'   // coordonnées client retenues d'une fois sur l'autre

// Mois précédent (au 1er août → juillet), période par défaut.
function moisPrecedent() {
  const n = new Date()
  const debut = new Date(n.getFullYear(), n.getMonth() - 1, 1)
  const fin = new Date(n.getFullYear(), n.getMonth(), 0)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: iso(debut), to: iso(fin) }
}

const fmt = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Montant en toutes lettres (mention obligatoire sur la facture).
function enLettres(n) {
  const u = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
  const d = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']
  function c(x) {
    if (x < 20) return u[x]
    if (x < 100) {
      const t = Math.floor(x / 10), r = x % 10
      if (t === 7 || t === 9) return d[t] + '-' + u[10 + r]
      return d[t] + (r === 1 && t !== 8 ? '-et-un' : r ? '-' + u[r] : (t === 8 ? 's' : ''))
    }
    if (x < 1000) { const q = Math.floor(x / 100), r = x % 100; return (q > 1 ? u[q] + ' ' : '') + 'cent' + (q > 1 && !r ? 's' : '') + (r ? ' ' + c(r) : '') }
    if (x < 1e6) { const q = Math.floor(x / 1000), r = x % 1000; return (q > 1 ? c(q) + ' ' : '') + 'mille' + (r ? ' ' + c(r) : '') }
    const q = Math.floor(x / 1e6), r = x % 1e6; return c(q) + ' million' + (q > 1 ? 's' : '') + (r ? ' ' + c(r) : '')
  }
  const e = Math.floor(n), cts = Math.round((n - e) * 100)
  return c(e) + ' dirham' + (e > 1 ? 's' : '') + (cts ? ' et ' + c(cts) + ' centime' + (cts > 1 ? 's' : '') : '')
}

export default function OcpFactureView({ user }) {
  const def = moisPrecedent()
  const [from, setFrom] = useState(def.from)
  const [to, setTo] = useState(def.to)
  const [evts, setEvts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [societe, setSociete] = useState(null)
  const [numero, setNumero] = useState('')
  const [dateFac, setDateFac] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })
  const [cli, setCli] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CLI_KEY)) || { nom: 'OCP SA', adr: '', ice: '' } }
    catch { return { nom: 'OCP SA', adr: '', ice: '' } }
  })

  useEffect(() => {
    supabase.from('societes').select('*').eq('code', 'LG').maybeSingle()
      .then(({ data }) => setSociete(data)).catch(() => {})
  }, [])
  const majCli = (k, v) => { const n = { ...cli, [k]: v }; setCli(n); localStorage.setItem(CLI_KEY, JSON.stringify(n)) }

  async function charger() {
    setLoading(true)
    try {
      const data = await loadOcpFactureData(from, to)
      setEvts(data)
      if (!data.length) toast.info('Aucune commande à facturer sur cette période')
    } catch (e) { toast.error(e?.message || 'Échec du chargement') }
    finally { setLoading(false) }
  }

  const setLigne = (ei, li, k, v) => setEvts(es => es.map((e, i) => i !== ei ? e : {
    ...e, lignes: e.lignes.map((l, j) => j !== li ? l : { ...l, [k]: k === 'd' ? v : (parseFloat(v) || 0) }),
  }))
  const delLigne = (ei, li) => setEvts(es => es.map((e, i) => i !== ei ? e : { ...e, lignes: e.lignes.filter((_, j) => j !== li) }))
  const addLigne = ei => setEvts(es => es.map((e, i) => i !== ei ? e : { ...e, lignes: [...e.lignes, { d: '', q: 1, pu: 0, tva: 10 }] }))
  const delEvt = ei => setEvts(es => es.filter((_, i) => i !== ei))

  // Totaux : les prix saisis sont TVA comprise → on déduit le HT par taux.
  const parTaux = {}
  let ttc = 0
  ;(evts || []).forEach(e => e.lignes.forEach(l => {
    const m = (l.q || 0) * (l.pu || 0)
    ttc += m
    parTaux[l.tva] = (parTaux[l.tva] || 0) + m
  }))
  const taux = Object.keys(parTaux).map(Number).sort((a, b) => a - b)
  const ht = taux.reduce((s, t) => s + parTaux[t] / (1 + t / 100), 0)

  async function enregistrer() {
    if (!numero.trim()) { toast.error('Mets d\'abord le numéro de facture'); return }
    setSaving(true)
    try {
      await saveOcpFacture({
        numero: numero.trim(), date_facture: dateFac, periode_du: from, periode_au: to,
        order_ids: evts.map(e => e.id),
        total_ht: Math.round(ht * 100) / 100,
        total_tva: Math.round((ttc - ht) * 100) / 100,
        total_ttc: Math.round(ttc * 100) / 100,
        contenu: { client: cli, evenements: evts },
        created_by: user?.id || null,
      })
      toast.success('Facture enregistrée — ces commandes ne réapparaîtront plus')
      setEvts(null)
    } catch (e) { toast.error(e?.message || 'Échec (SQL ocp_factures lancé ?)') }
    finally { setSaving(false) }
  }

  const S = societe || {}
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 12 }}>
      <style>{`
        .fac input { font: inherit; color: inherit; border: 1px solid ${LINE}; border-radius: 6px; padding: 4px 6px; background: #fffdf9 }
        .fac input:focus { outline: 2px solid rgba(122,31,61,.35); background: #fff }
        .fac .des { width: 100%; border: 0; background: transparent; padding: 3px 2px }
        .fac .zero { background: #fff4d6; border-color: #e8b83a }
        @media print {
          .fac input, .fac .des { border-color: transparent !important; background: transparent !important }
          .fac .zero { background: transparent !important }
          .no-print { display: none !important }
        }
      `}</style>

      <h1 className="font-fraunces text-2xl text-bordeaux mb-1">🧾 Facture OCP</h1>
      <p className="text-[12px] text-ink-soft mb-3">Reprend les commandes OCP <b>confirmées et non encore facturées</b> de la période. Un événement = une commande. Tout est modifiable, les totaux se recalculent.</p>

      <div className="no-print" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 12, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: SOFT, display: 'block' }}>Du</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: '5px 7px' }} />
        </div>
        <div>
          <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: SOFT, display: 'block' }}>Au</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: '5px 7px' }} />
        </div>
        <button onClick={charger} disabled={loading}
          style={{ background: B, color: '#fff', border: 0, borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: loading ? .6 : 1 }}>
          {loading ? 'Chargement…' : 'Générer la facture'}
        </button>
        {evts?.length > 0 && (
          <>
            <span style={{ flex: 1 }} />
            <button onClick={() => window.print()}
              style={{ background: '#fff', color: B, border: `1.5px solid ${B}`, borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Imprimer / PDF
            </button>
            <button onClick={enregistrer} disabled={saving}
              style={{ background: '#1e7e4f', color: '#fff', border: 0, borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
              {saving ? 'Enregistrement…' : 'Enregistrer la facture'}
            </button>
          </>
        )}
      </div>

      {evts?.length === 0 && (
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, textAlign: 'center', color: SOFT, fontSize: 13 }}>
          Aucune commande à facturer sur cette période.
        </div>
      )}

      {evts?.length > 0 && (
        <div className="fac print-area" style={{ background: '#fff', padding: '26px 30px', border: `1px solid ${LINE}`, borderRadius: 14 }}>
          {/* En-tête : logo à gauche, client à droite */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, borderBottom: `2px solid ${B}`, paddingBottom: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, color: SOFT, lineHeight: 1.5 }}>
              <img src="/logo.png" alt="Lily Gourmet" style={{ width: 66, height: 66, objectFit: 'contain', display: 'block', marginBottom: 6 }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2b2320' }}>{S.nom || 'LG Traiteur SARL'}</div>
            </div>
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', minWidth: 270 }}>
              <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: B, fontWeight: 800, marginBottom: 5 }}>Facturé à</div>
              <input value={cli.nom} onChange={e => majCli('nom', e.target.value)} style={{ width: '100%', fontWeight: 800, marginBottom: 4 }} />
              <input value={cli.adr} onChange={e => majCli('adr', e.target.value)} placeholder="Adresse du client" style={{ width: '100%', fontSize: 12, marginBottom: 4 }} />
              <input value={cli.ice} onChange={e => majCli('ice', e.target.value)} placeholder="ICE du client" style={{ width: '100%', fontSize: 12 }} />
            </div>
          </div>

          <h2 style={{ fontSize: 22, color: B, margin: '0 0 2px', fontWeight: 800 }}>FACTURE</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: SOFT, display: 'block' }}>N° de facture</label>
              <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="ex. FA-2026-014" style={{ width: 160, fontWeight: 800 }} />
            </div>
            <div>
              <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: SOFT, display: 'block' }}>Date de facture</label>
              <input type="date" value={dateFac} onChange={e => setDateFac(e.target.value)} />
            </div>
          </div>

          {evts.map((e, ei) => {
            const sous = e.lignes.reduce((s, l) => s + (l.q || 0) * (l.pu || 0), 0)
            return (
              <div key={e.id} style={{ marginBottom: 20, breakInside: 'avoid' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#faf5ef', borderLeft: `3px solid ${B}`, padding: '6px 10px', fontWeight: 800, color: B, fontSize: 13.5 }}>
                  Événement du {e.dateFr}
                  <span style={{ fontWeight: 600, color: SOFT, fontSize: 11.5 }}>réf. {e.ref}</span>
                  <span style={{ flex: 1 }} />
                  <button className="no-print" onClick={() => delEvt(ei)} title="Retirer cet événement"
                    style={{ border: 0, background: 'none', color: '#b42424', cursor: 'pointer', fontSize: 15 }}>✕</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                  <thead>
                    <tr>
                      {['Désignation', 'Qté', 'P.U. TTC', 'Total TTC'].map((h, i) => (
                        <th key={h} style={{ fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase', color: SOFT, textAlign: i ? 'right' : 'left', borderBottom: `1px solid ${LINE}`, padding: '5px 6px', fontWeight: 700 }}>{h}</th>
                      ))}
                      <th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {e.lignes.map((l, li) => (
                      <tr key={li}>
                        <td style={{ borderBottom: '1px solid #f2ece2', padding: '3px 6px' }}>
                          <input className="des" value={l.d} onChange={ev => setLigne(ei, li, 'd', ev.target.value)} />
                        </td>
                        <td style={{ borderBottom: '1px solid #f2ece2', padding: '3px 6px', textAlign: 'right' }}>
                          <input type="number" step="0.01" value={l.q} onChange={ev => setLigne(ei, li, 'q', ev.target.value)} style={{ width: 62, textAlign: 'right' }} />
                        </td>
                        <td style={{ borderBottom: '1px solid #f2ece2', padding: '3px 6px', textAlign: 'right' }}>
                          <input type="number" step="0.01" value={l.pu} onChange={ev => setLigne(ei, li, 'pu', ev.target.value)} className={l.pu ? '' : 'zero'} style={{ width: 88, textAlign: 'right' }} />
                        </td>
                        <td style={{ borderBottom: '1px solid #f2ece2', padding: '3px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt((l.q || 0) * (l.pu || 0))}</td>
                        <td className="no-print" style={{ borderBottom: '1px solid #f2ece2', padding: '3px 6px' }}>
                          <button onClick={() => delLigne(ei, li)} style={{ border: 0, background: 'none', color: '#b42424', cursor: 'pointer' }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="no-print" onClick={() => addLigne(ei)}
                  style={{ border: `1px dashed ${LINE}`, background: '#fffdf9', color: B, borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}>
                  + ajouter une ligne
                </button>
                <div style={{ textAlign: 'right', fontSize: 12.5, color: SOFT, padding: '5px 6px 0' }}>
                  Sous-total événement : <b style={{ color: '#2b2320', fontSize: 14 }}>{fmt(sous)} DH</b>
                </div>
              </div>
            )
          })}

          <div style={{ marginLeft: 'auto', width: 290, border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 13, borderBottom: '1px solid #f2ece2' }}>
              <span>Total HT</span><b>{fmt(ht)}</b>
            </div>
            {taux.map(t => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 13, borderBottom: '1px solid #f2ece2' }}>
                <span>TVA {t} %</span><span>{fmt(parTaux[t] - parTaux[t] / (1 + t / 100))}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: B, color: '#fff', fontWeight: 800, fontSize: 15 }}>
              <span>Total TTC</span><span>{fmt(ttc)} DH</span>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5, fontStyle: 'italic', color: SOFT, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
            Arrêtée la présente facture à la somme de : <b>{enLettres(Math.round(ttc * 100) / 100)}</b>
          </div>

          <div style={{ marginTop: 22, borderTop: `1px solid ${LINE}`, paddingTop: 8, fontSize: 10.5, color: SOFT, textAlign: 'center', lineHeight: 1.6 }}>
            {S.nom} · {S.adresse} · Capital {S.capital_dh ? Number(S.capital_dh).toLocaleString('fr-FR') : ''} DH<br />
            RC {S.rc} · IF {S.if_num} · Patente {S.patente} · ICE {S.ice} · CNSS {S.cnss}<br />
            {S.banque_societe} · {S.compte_bancaire}
          </div>
        </div>
      )}
    </div>
  )
}
