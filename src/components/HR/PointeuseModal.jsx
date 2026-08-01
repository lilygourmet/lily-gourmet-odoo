import { useState, useEffect } from 'react'
import { Fingerprint, Trash2, Plus, RefreshCw, X, Monitor } from 'lucide-react'
import SearchSelect from '../SearchSelect'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'
import {
  loadMachines, saveMachineName, loadPointeuseMapping, savePointeuseUser,
  deletePointeuseUser, loadRecentPunches, loadOdooEmployees, flushPointeuseToOdoo, machineLabel,
} from '../../lib/pointeuse'

const STATUT = {
  done:     { label: 'Enregistré', bg: '#EAF3DE', text: '#27500A' },
  dup:      { label: 'Doublon ignoré', bg: '#F4F0EA', text: '#8a7a70' },
  pending:  { label: 'En attente',  bg: '#FFF7E0', text: '#854F0B' },
  unmapped: { label: 'Non relié',   bg: '#FCEBEB', text: '#A32D2D' },
  error:    { label: 'Erreur',      bg: '#FCEBEB', text: '#A32D2D' },
}

export default function PointeuseModal({ onClose }) {
  const [machines, setMachines] = useState([])
  const [mapping, setMapping] = useState([])
  const [employes, setEmployes] = useState([])
  const [punches, setPunches] = useState([])
  const [loading, setLoading] = useState(true)
  const [newSn, setNewSn] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newEmp, setNewEmp] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [mac, m, p] = await Promise.all([loadMachines(), loadPointeuseMapping(), loadRecentPunches(50)])
    setMachines(mac); setMapping(m); setPunches(p)
    if (!newSn && mac.length) setNewSn(mac[0].sn)
  }

  useEffect(() => {
    (async () => {
      try {
        const [mac, m, p, e] = await Promise.all([
          loadMachines(), loadPointeuseMapping(), loadRecentPunches(50), loadOdooEmployees(),
        ])
        setMachines(mac); setMapping(m); setPunches(p); setEmployes(e)
        if (mac.length) setNewSn(mac[0].sn)
      } catch (err) { toast.error('Erreur : ' + err.message) }
      setLoading(false)
    })()
  }, [])

  async function handleRenameMachine(sn, nom) {
    try { await saveMachineName(sn, nom); setMachines(ms => ms.map(m => m.sn === sn ? { ...m, nom } : m)) }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleAdd() {
    if (!newSn) { toast.error('Choisis une machine.'); return }
    if (!newPin.trim() || !newEmp) { toast.error('Numéro et employé requis.'); return }
    const emp = employes.find(e => String(e.id) === String(newEmp))
    setBusy(true)
    try {
      await savePointeuseUser(newSn, newPin, Number(newEmp), emp?.name || null)
      setNewPin(''); setNewEmp('')
      await reload()
      toast.success('Correspondance enregistrée.')
    } catch (e) { toast.error('Erreur : ' + e.message) }
    setBusy(false)
  }

  async function handleDelete(sn, pin) {
    if (!await confirmDialog(`Supprimer la correspondance ${machineLabel(sn, machines)} · numéro ${pin} ?`, { confirmLabel: 'Supprimer' })) return
    try { await deletePointeuseUser(sn, pin); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleFlush() {
    setBusy(true)
    try {
      const r = await flushPointeuseToOdoo()
      await reload()
      toast.success(`Envoyés : ${r.done} · non reliés : ${r.unmapped} · erreurs : ${r.errors}`)
    } catch (e) { toast.error('Erreur : ' + e.message) }
    setBusy(false)
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
  const modal = { background: 'white', borderRadius: 16, padding: 22, maxWidth: 660, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }
  const ipt = { padding: '8px 10px', border: '1px solid #E5D8C3', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
  const secTitle = { fontSize: 13, fontWeight: 600, color: '#1a0f0a', margin: '18px 0 8px' }

  // Correspondances groupées par machine
  const parMachine = machines.map(mac => ({
    ...mac,
    lignes: mapping.filter(m => m.sn === mac.sn),
  }))

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Fingerprint size={18} /> Pointeuse empreinte
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8a7a70' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: '#8a7a70', marginTop: 0, marginBottom: 8 }}>
          Relie chaque numéro (tapé sur une machine) à un employé. La correspondance est
          <b> par machine</b> : le numéro 1 de la Boutique ≠ le numéro 1 de l'Annexe.
        </p>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#8a7a70' }}>Chargement…</div>
        ) : (
          <>
            {/* Machines : donner un nom */}
            <div style={secTitle}>Machines</div>
            {machines.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', color: '#8a7a70', fontSize: 13, background: '#F9F6F1', borderRadius: 8 }}>
                Aucune machine détectée pour l'instant.
              </div>
            ) : machines.map(m => (
              <div key={m.sn} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Monitor size={15} style={{ color: '#993556', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#8a7a70', minWidth: 116 }}>SN …{m.sn.slice(-4)}</span>
                <input
                  defaultValue={m.nom}
                  onBlur={e => { if (e.target.value !== m.nom) handleRenameMachine(m.sn, e.target.value) }}
                  placeholder="Nom (ex. Boutique)"
                  style={{ ...ipt, flex: 1 }}
                />
              </div>
            ))}

            {/* Ajout d'une correspondance */}
            <div style={secTitle}>Ajouter une correspondance</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr auto', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <select value={newSn} onChange={e => setNewSn(e.target.value)} style={ipt}>
                {machines.map(m => <option key={m.sn} value={m.sn}>{m.nom || '…' + m.sn.slice(-4)}</option>)}
              </select>
              <input value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="N°" inputMode="numeric" style={ipt} />
              <SearchSelect
                value={newEmp}
                onChange={setNewEmp}
                placeholder="Employé…"
                inputStyle={{ ...ipt, width: '100%' }}
                options={employes.map(e => ({ value: String(e.id), label: e.name }))}
              />
              <button onClick={handleAdd} disabled={busy} style={{ padding: '8px 12px', border: 'none', borderRadius: 8, background: '#993556', color: 'white', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> Ajouter
              </button>
            </div>

            {/* Correspondances par machine */}
            {mapping.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#8a7a70', fontSize: 13, background: '#F9F6F1', borderRadius: 8, marginBottom: 8 }}>
                Aucune correspondance. Ajoute les numéros ci-dessus.
              </div>
            ) : parMachine.filter(mac => mac.lignes.length).map(mac => (
              <div key={mac.sn} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#993556', marginBottom: 4 }}>
                  {mac.nom || '…' + mac.sn.slice(-4)}
                </div>
                <div style={{ border: '1px solid #F0E9DF', borderRadius: 10, overflow: 'hidden' }}>
                  {mac.lignes.map((m, i) => (
                    <div key={m.pin} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: i % 2 ? '#FBF9F5' : 'white' }}>
                      <span style={{ minWidth: 42, fontWeight: 600, color: '#993556' }}>#{m.pin}</span>
                      <span style={{ flex: 1, fontSize: 13, color: '#1a0f0a' }}>{m.employe_nom || '—'}</span>
                      <button onClick={() => handleDelete(m.sn, m.pin)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#A32D2D', display: 'inline-flex' }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Pointages reçus */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 8px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a0f0a' }}>Derniers pointages reçus</div>
              <button onClick={handleFlush} disabled={busy} style={{ padding: '6px 10px', border: '1px solid #0C447C', borderRadius: 8, background: 'white', color: '#0C447C', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={13} /> Renvoyer les pointages
              </button>
            </div>
            {punches.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#8a7a70', fontSize: 13, background: '#F9F6F1', borderRadius: 8 }}>
                Aucun pointage reçu pour l'instant.
              </div>
            ) : (
              <div style={{ border: '1px solid #F0E9DF', borderRadius: 10, overflow: 'hidden' }}>
                {punches.map((p, i) => {
                  const s = STATUT[p.status] || { label: p.status, bg: '#F4F0EA', text: '#4a3a30' }
                  const nom = mapping.find(m => m.sn === p.sn && String(m.pin) === String(p.pin))?.employe_nom
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: i % 2 ? '#FBF9F5' : 'white', fontSize: 12.5 }}>
                      <span style={{ fontSize: 11, color: '#8a7a70', minWidth: 62 }}>{machineLabel(p.sn, machines)}</span>
                      <span style={{ minWidth: 34, fontWeight: 600, color: '#993556' }}>#{p.pin}</span>
                      <span style={{ flex: 1, color: '#1a0f0a' }}>{nom || <span style={{ color: '#8a7a70' }}>non relié</span>}</span>
                      <span style={{ color: '#4a3a30' }}>{p.punch_local}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.text, fontWeight: 500 }}>{s.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
