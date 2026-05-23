import { useState, useEffect, useMemo } from 'react'
import { loadEmployes, generateAttestation, getAllTemplates } from '../../lib/hr'

/**
 * Onglet Attestations : choix du type + employé + champs + génération.
 */
export default function AttestationsTab({ user }) {
  const [employes, setEmployes] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [type, setType] = useState('salaire')
  const [empId, setEmpId] = useState('')
  // Données formulaire (saisies/auto-remplies)
  const [form, setForm] = useState({
    nom: '', nom_arabe: '', nom_famille: '', prenom: '',
    cnss: '', cin: '', poste: '',
    salaire: '', adresse: '', date_entree: '', date_sortie: '',
    date_debut: '', date_fin: '', date_emission: '', date_effet: '',
    nationalite: 'مغربي', duree: '',
  })

  const templates = useMemo(() => getAllTemplates(), [])
  const currentTemplate = useMemo(() => templates.find(t => t.key === type), [templates, type])

  // Charger les employés
  useEffect(() => { (async () => {
    setLoading(true)
    try {
      const list = await loadEmployes(true)  // actifs seulement
      setEmployes(list)
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
    })
  }

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleGenerate(e) {
    e?.preventDefault?.()
    setError(null); setSuccess(null); setGenerating(true)
    try {
      await generateAttestation(type, form)
      setSuccess(`✅ Document généré et téléchargé : ${currentTemplate.label} pour ${form.nom}`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Erreur lors de la génération')
    }
    setGenerating(false)
  }

  return (
    <div>
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
                  padding: '12px 14px', border: `2px solid ${active ? '#993556' : '#E8E2D8'}`,
                  background: active ? '#FCEEE8' : 'white', borderRadius: 8,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, color: active ? '#993556' : '#3A3733',
                  fontWeight: active ? 500 : 400,
                }}>
                  <input type="radio" name="type" value={t.key}
                    checked={active} onChange={() => setType(t.key)}
                    style={{ accentColor: '#993556' }} />
                  <span>{getEmoji(t.key)} {t.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Sélecteur d'employé */}
        <div style={{ marginBottom: 14 }}>
          <label style={lblStyle}>Sélectionner un employé</label>
          <select value={empId} onChange={e => handleSelectEmploye(e.target.value)}
            style={inputStyle} disabled={loading}>
            <option value="">— {loading ? 'Chargement…' : `Choisir parmi ${employes.length} employés`} —</option>
            {employes.map(e => (
              <option key={e.id} value={e.id}>
                {e.nom}{e.poste ? ` · ${e.poste}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Champs dynamiques selon le type */}
        <div style={{
          background: '#F9F6F1', padding: 16, borderRadius: 10, marginBottom: 16
        }}>
          <div style={{ fontSize: 11, color: '#6F6A60', marginBottom: 12 }}>
            ℹ️ Champs requis pour ce type d'attestation (auto-remplis si dispo)
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
          borderRadius: 8, cursor: generating ? 'wait' : 'pointer'
        }}>
          {generating ? '⏳ Génération en cours…' : '⬇️ Générer et télécharger le document Word'}
        </button>
      </form>
    </div>
  )
}

function getEmoji(type) {
  const m = {
    salaire: '💰',
    travail_en_poste: '✅',
    travail_depart: '📋',
    accuse: '📄',
    stage: '🎓',
  }
  return m[type] || '📜'
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

const lblStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#3A3733', marginBottom: 8 }
const lblFieldStyle = { display: 'block', fontSize: 11, fontWeight: 500, color: '#6F6A60', marginBottom: 4 }
const inputStyle = {
  width: '100%', padding: '9px 11px', fontSize: 13,
  border: '1px solid #E8E2D8', borderRadius: 6, background: 'white',
  fontFamily: 'inherit', boxSizing: 'border-box'
}
