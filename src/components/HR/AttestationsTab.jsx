import { useState, useEffect, useMemo } from 'react'
import { FileText, FilePen, Building2, Info, Wallet, CheckCircle2, ClipboardList, GraduationCap, Clock, Download } from 'lucide-react'
import { loadEmployes, generateAttestation, getAllTemplates } from '../../lib/hr'
import SearchSelect from '../SearchSelect'

/**
 * Onglet Attestations : choix du type + employé + champs + génération.
 */
export default function AttestationsTab({ user, isAdmin }) {
  const [employes, setEmployes] = useState([])
  const [societes, setSocietes] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [subTab, setSubTab] = useState('attestations')  // 'attestations' | 'contrats'
  const [type, setType] = useState(isAdmin ? 'salaire' : 'stage')
  const [empId, setEmpId] = useState('')
  // Données formulaire (saisies/auto-remplies)
  const [form, setForm] = useState({
    nom: '', nom_arabe: '', nom_famille: '', prenom: '',
    cnss: '', cin: '', poste: '',
    salaire: '', adresse: '', date_entree: '', date_sortie: '',
    date_debut: '', date_fin: '', date_emission: '', date_effet: '',
    nationalite: 'مغربي', duree: '',
    date_depart: '', date_med: '',
  })

  const allTemplates = useMemo(() => getAllTemplates(), [])
  // Catégoriser : attestation vs contrat
  function isContrat(t) {
    const k = (t.key || '').toLowerCase()
    return k.includes('cdi') || k.includes('cdd') || k.startsWith('contrat')
  }
  const templates = useMemo(() => {
    let list = allTemplates
    // Restriction perm_hr : seulement attestation de stage
    if (!isAdmin) list = list.filter(t => t.key === 'stage')
    // Filtrer par sous-onglet
    if (subTab === 'contrats') list = list.filter(isContrat)
    else list = list.filter(t => !isContrat(t))
    return list
  }, [allTemplates, isAdmin, subTab])

  // Si le type courant n'est plus dans la liste filtrée, choisir le premier dispo
  useEffect(() => {
    if (templates.length > 0 && !templates.find(t => t.key === type)) {
      setType(templates[0].key)
    }
  }, [templates, type])

  const currentTemplate = useMemo(() => templates.find(t => t.key === type), [templates, type])

  // Charger les employés
  useEffect(() => { (async () => {
    setLoading(true)
    try {
      const list = await loadEmployes(true)
      setEmployes(list)
      // Charger les sociétés
      const { supabase } = await import('../../lib/supabase')
      const { data: socList } = await supabase.from('societes').select('*')
      setSocietes(socList || [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  })() }, [])

  // Pré-remplir le form quand un employé est sélectionné
  function handleSelectEmploye(id) {
    setEmpId(id)
    if (!id) {
      setForm({ ...form, nom: '', cnss: '', cin: '', poste: '', salaire: '', date_entree: '' })
      return
    }
    const e = employes.find(emp => String(emp.id) === String(id))
    if (!e) return
    // Auto-split nom_arabe en prenom + nom_famille
    // Convention : le 1er mot = prénom, le reste = nom de famille
    let prenom = '', nom_famille = ''
    const src = e.nom_arabe || e.nom || ''
    const parts = src.trim().split(/\s+/)
    if (parts.length >= 2) {
      prenom = parts[0]
      nom_famille = parts.slice(1).join(' ')
    } else if (parts.length === 1) {
      prenom = parts[0]
    }
    setForm({
      ...form,
      nom: e.nom || '',
      nom_arabe: e.nom_arabe || '',
      nom_famille: nom_famille,
      prenom: prenom,
      cnss: e.cnss || '',
      cin: e.cin || '',
      poste: e.poste || '',
      salaire: e.salaire_net ? String(e.salaire_net) : '',
      adresse: e.adresse || '',
      date_entree: e.date_entree || '',
      date_sortie: e.date_sortie || '',
      societe_id: e.societe_id || null,
    })
  }

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleGenerate(e) {
    e?.preventDefault?.()
    setError(null); setSuccess(null); setGenerating(true)
    try {
      // Injecter les données société
      const soc = societes.find(s => s.id === form.societe_id)
      const formAvecSociete = {
        ...form,
        societe_nom: soc?.nom || '',
        societe_capital: soc?.capital_dh ? Number(soc.capital_dh).toLocaleString('fr-FR') : '',
        societe_adresse: soc?.adresse || '',
        societe_rc: soc?.rc || '',
        societe_patente: soc?.patente || '',
        societe_if: soc?.if_num || '',
        societe_cnss: soc?.cnss || '',
        societe_ice: soc?.ice || '',
      }
      await generateAttestation(type, formAvecSociete)
      setSuccess(`✅ Document généré et téléchargé : ${currentTemplate.label} pour ${form.nom}${soc ? ' · ' + soc.nom : ''}`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Erreur lors de la génération')
    }
    setGenerating(false)
  }

  return (
    <div>
      {/* Sous-onglets : Attestations / Contrats */}
      {isAdmin && (
        <div style={{
          display: 'flex', gap: 4, padding: 3, background: '#F4F0EA', borderRadius: 8,
          marginBottom: 16, width: 'fit-content',
        }}>
          {[
            { v: 'attestations', label: 'Attestations', Icon: FileText },
            { v: 'contrats', label: 'Contrats', Icon: FilePen },
          ].map(t => (
            <button key={t.v} type="button" onClick={() => setSubTab(t.v)} style={{
              padding: '7px 14px', fontSize: 13, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: subTab === t.v ? 'white' : 'transparent',
              color: subTab === t.v ? '#1a0f0a' : '#4a3a30',
              fontWeight: subTab === t.v ? 500 : 400,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}><t.Icon size={14} /> {t.label}</button>
          ))}
        </div>
      )}

      <form onSubmit={handleGenerate}>

        {/* Type de document */}
        <div style={{ marginBottom: 18 }}>
          <label style={lblStyle}>Type de document</label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 10
          }}>
            {templates.map(t => {
              const active = type === t.key
              return (
                <label key={t.key} style={{
                  padding: '12px 14px', border: `2px solid ${active ? '#993556' : '#e5d8c3'}`,
                  background: active ? '#FCEEE8' : 'white', borderRadius: 8,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, color: active ? '#993556' : '#1a0f0a',
                  fontWeight: active ? 500 : 400,
                }}>
                  <input type="radio" name="type" value={t.key}
                    checked={active} onChange={() => setType(t.key)}
                    style={{ accentColor: '#993556' }} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {(() => { const Ico = getTemplateIcon(t.key); return <Ico size={14} /> })()}
                    {t.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Sélecteur d'employé */}
        <div style={{ marginBottom: 14 }}>
          <label style={lblStyle}>Sélectionner un employé</label>
          <SearchSelect
            value={empId ? String(empId) : ''}
            onChange={v => handleSelectEmploye(v)}
            placeholder={loading ? 'Chargement…' : `Chercher parmi ${employes.length} employés…`}
            inputStyle={inputStyle}
            options={employes.map(e => ({ value: String(e.id), label: `${e.nom}${e.poste ? ' · ' + e.poste : ''}` }))}
          />
          {form.societe_id && (
            <div style={{
              marginTop: 6, padding: '6px 10px',
              background: '#EAF3DE', color: '#27500A',
              borderRadius: 6, fontSize: 11,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Building2 size={14} /> Société : <strong>{societes.find(s => s.id === form.societe_id)?.nom || '—'}</strong>
            </div>
          )}
        </div>

        {/* Champs dynamiques selon le type */}
        <div style={{
          background: '#F9F6F1', padding: 16, borderRadius: 12, marginBottom: 16
        }}>
          <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Info size={14} /> Champs requis pour ce type d'attestation (auto-remplis si dispo)
          </div>

          <Row>
            <Field label="Nom complet *"
              value={form.nom} onChange={v => handleChange('nom', v)}
              placeholder="Ex : ASMAA EL AABADI" required />
            {currentTemplate?.required.includes('cnss') && (
              <Field label="N° CNSS *"
                value={form.cnss} onChange={v => handleChange('cnss', v)}
                placeholder="Ex : 182572887" />
            )}
          </Row>

          {currentTemplate?.required.includes('nom_arabe') && (
            <Row>
              <div>
                <label style={lblFieldStyle}>Nom en arabe *</label>
                <input
                  type="text"
                  value={form.nom_arabe || ''}
                  onChange={e => handleChange('nom_arabe', e.target.value)}
                  placeholder="مثال : أسماء العبادي"
                  required
                  style={{ ...inputStyle, direction: 'rtl', fontFamily: 'Arial, sans-serif' }}
                />
              </div>
              <Field label="Adresse"
                value={form.adresse} onChange={v => handleChange('adresse', v)}
                placeholder="Ex : 12 rue X, Quartier Y, Rabat" />
            </Row>
          )}

          {/* CONTRATS : nom famille + prénom séparés + adresse */}
          {currentTemplate?.required.includes('nom_famille') && (
            <>
              <Row>
                <div>
                  <label style={lblFieldStyle}>الإسم العائلي (Nom de famille) *</label>
                  <input
                    type="text"
                    value={form.nom_famille || ''}
                    onChange={e => handleChange('nom_famille', e.target.value)}
                    placeholder="مثال : العبادي"
                    required
                    style={{ ...inputStyle, direction: 'rtl', fontFamily: 'Arial, sans-serif' }}
                  />
                </div>
                <div>
                  <label style={lblFieldStyle}>الإسم الشخصي (Prénom) *</label>
                  <input
                    type="text"
                    value={form.prenom || ''}
                    onChange={e => handleChange('prenom', e.target.value)}
                    placeholder="مثال : أسماء"
                    required
                    style={{ ...inputStyle, direction: 'rtl', fontFamily: 'Arial, sans-serif' }}
                  />
                </div>
              </Row>
              <Row>
                <Field label="Adresse (en français)" value={form.adresse} onChange={v => handleChange('adresse', v)} placeholder="Ex : 12 rue X, Quartier Y, Rabat" />
                <div>
                  <label style={lblFieldStyle}>Nationalité (arabe)</label>
                  <input
                    type="text"
                    value={form.nationalite || ''}
                    onChange={e => handleChange('nationalite', e.target.value)}
                    placeholder="مغربي"
                    style={{ ...inputStyle, direction: 'rtl', fontFamily: 'Arial, sans-serif' }}
                  />
                </div>
              </Row>
            </>
          )}

          {currentTemplate?.required.includes('cin') && (
            <Row>
              <Field label="N° CIN *"
                value={form.cin} onChange={v => handleChange('cin', v)}
                placeholder="Ex : A394604" />
              <div />
            </Row>
          )}

          {currentTemplate?.required.includes('poste') && (
            <Row>
              <Field label="Poste *"
                value={form.poste} onChange={v => handleChange('poste', v)}
                placeholder="Ex : Pâtissière" />
              <div />
            </Row>
          )}

          {currentTemplate?.required.includes('salaire') && currentTemplate?.category !== 'contrat' && (
            <Row>
              <Field label="Salaire net (DH) *"
                value={form.salaire} onChange={v => handleChange('salaire', v)}
                placeholder="Ex : 8500" />
              <div />
            </Row>
          )}

          {(currentTemplate?.required.includes('date_entree') ||
            currentTemplate?.required.includes('date_sortie')) && (
            <Row>
              {currentTemplate?.required.includes('date_entree') && (
                <Field label="Date d'entrée *" type="date"
                  value={form.date_entree} onChange={v => handleChange('date_entree', v)} />
              )}
              {currentTemplate?.required.includes('date_sortie') && (
                <Field label="Date de sortie *" type="date"
                  value={form.date_sortie} onChange={v => handleChange('date_sortie', v)} />
              )}
            </Row>
          )}

          {/* Champs Mise en demeure / Abandon de poste */}
          {(type === 'mise_en_demeure' || type === 'abandon_poste') && (
            <Row>
              <Field label="Adresse de l'employé"
                value={form.adresse} onChange={v => handleChange('adresse', v)}
                placeholder="Ex : 12 rue X, Quartier Y, Rabat" />
              <div />
            </Row>
          )}
          {type === 'abandon_poste' && (
            <Row>
              <Field label="Quitté le poste depuis (vide = il y a 4 jours)" type="date"
                value={form.date_depart} onChange={v => handleChange('date_depart', v)} />
              <Field label="Date de la mise en demeure (vide = il y a 2 jours)" type="date"
                value={form.date_med} onChange={v => handleChange('date_med', v)} />
            </Row>
          )}

          {/* Champs spécifiques au STAGE */}
          {type === 'stage' && (
            <>
              <Row>
                <Field label="Date début stage *" type="date"
                  value={form.date_debut} onChange={v => handleChange('date_debut', v)} />
                <Field label="Date fin stage *" type="date"
                  value={form.date_fin} onChange={v => handleChange('date_fin', v)} />
              </Row>
              <Row>
                <Field label="Date d'émission (par défaut : aujourd'hui)" type="date"
                  value={form.date_emission} onChange={v => handleChange('date_emission', v)} />
                <div />
              </Row>
            </>
          )}

          {/* Champs spécifiques aux CONTRATS */}
          {currentTemplate?.category === 'contrat' && (
            <>
              {currentTemplate?.required.includes('date_debut') && (
                <Row>
                  <Field label="Date de début *" type="date"
                    value={form.date_debut} onChange={v => handleChange('date_debut', v)} />
                  {currentTemplate?.required.includes('date_fin') && (
                    <Field label="Date de fin (CDD) *" type="date"
                      value={form.date_fin} onChange={v => handleChange('date_fin', v)} />
                  )}
                </Row>
              )}
              {currentTemplate?.required.includes('duree') && (
                <Row>
                  <div>
                    <label style={lblFieldStyle}>Durée du contrat (arabe)</label>
                    <input type="text"
                      value={form.duree || ''}
                      onChange={e => handleChange('duree', e.target.value)}
                      placeholder="6 أشهر"
                      style={{ ...inputStyle, direction: 'rtl', fontFamily: 'Arial, sans-serif' }} />
                  </div>
                  <div />
                </Row>
              )}
              {currentTemplate?.required.includes('salaire') && (
                <Row>
                  <Field label="Salaire net (DH) *"
                    value={form.salaire} onChange={v => handleChange('salaire', v)}
                    placeholder="Ex : 8500" />
                  <div />
                </Row>
              )}
              {currentTemplate?.required.includes('date_effet') && (
                <Row>
                  <Field label="Date d'effet du contrat *" type="date"
                    value={form.date_effet} onChange={v => handleChange('date_effet', v)} />
                  <div />
                </Row>
              )}
            </>
          )}
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: '#FCE9E8', color: '#99201E',
            borderRadius: 6, fontSize: 13, marginBottom: 12
          }}>
            ❌ {error}
          </div>
        )}
        {success && (
          <div style={{
            padding: '10px 14px', background: '#E8F8F0', color: '#1E7E4F',
            borderRadius: 6, fontSize: 13, marginBottom: 12
          }}>
            {success}
          </div>
        )}

        <button type="submit" disabled={generating} style={{
          width: '100%', padding: '14px', fontSize: 14, fontWeight: 500,
          background: '#993556', color: 'white', border: '1px solid #993556',
          borderRadius: 8, cursor: generating ? 'wait' : 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {generating ? (
            <><Clock size={16} /> Génération en cours…</>
          ) : (
            <><Download size={16} /> Générer et télécharger le document Word</>
          )}
        </button>
      </form>
    </div>
  )
}

function getTemplateIcon(type) {
  const m = {
    salaire: Wallet,
    travail_en_poste: CheckCircle2,
    travail_depart: ClipboardList,
    accuse: FileText,
    stage: GraduationCap,
  }
  return m[type] || FileText
}

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>{children}</div>
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false }) {
  return (
    <div>
      <label style={lblFieldStyle}>{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={inputStyle}
      />
    </div>
  )
}

const lblStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#1a0f0a', marginBottom: 8 }
const lblFieldStyle = { display: 'block', fontSize: 11, fontWeight: 500, color: '#4a3a30', marginBottom: 4 }
const inputStyle = {
  width: '100%', padding: '9px 11px', fontSize: 13,
  border: '1px solid #e5d8c3', borderRadius: 6, background: 'white',
  fontFamily: 'inherit', boxSizing: 'border-box'
}
