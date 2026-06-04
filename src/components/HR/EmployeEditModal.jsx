import { useState, useEffect } from 'react'
import { Plus, Pencil, Clock, Lock, CheckCircle2 } from 'lucide-react'
import { createEmploye, updateEmploye, loadEmployes, EMPLOYE_GROUPES } from '../../lib/hr'
import { supabase } from '../../lib/supabase'
import { createUserForEmploye, deactivateUserForEmploye } from '../../lib/users'

// Normalise un numéro marocain en format international WATI (212XXXXXXXXX)
// Ex : "06 66 32 84 93" → "212666328493"
function normalizePhoneMA(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('212')) return digits
  if (digits.startsWith('0'))   return '212' + digits.slice(1)
  return digits
}

const TYPES_CONTRAT = ['CDI', 'CDD', 'Stage', 'Interim', 'Autre']

export default function EmployeEditModal({
  employe, user, isAdmin, onClose, onSaved,
  // Props OPTIONNELLES si le parent veut contrôler la liste (sinon chargée auto)
  employesList: employesListProp = null,
  onNavigate = null,
}) {
  const isNew = !employe
  const [form, setForm] = useState(() => initForm(employe))
  const [societes, setSocietes] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Liste des employés pour la navigation ◀ ▶
  // - Si le parent passe employesListProp, on l'utilise
  // - Sinon on charge tous les actifs depuis Supabase (mode autonome)
  const [employesListAuto, setEmployesListAuto] = useState([])
  const [currentEmploye, setCurrentEmploye] = useState(employe)

  const employesList = employesListProp || employesListAuto

  // Charger sociétés
  useEffect(() => { (async () => {
    const { supabase } = await import('../../lib/supabase')
    const { data } = await supabase.from('societes').select('*').order('code')
    setSocietes(data || [])
  })() }, [])

  // Charger la liste auto des employés actifs si le parent n'en fournit pas
  useEffect(() => {
    if (employesListProp) return  // parent contrôle, rien à faire
    if (isNew) return
    ;(async () => {
      try {
        const all = await loadEmployes(true)  // actifs uniquement
        // Tri alphabétique par nom pour une nav cohérente
        all.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' }))
        setEmployesListAuto(all)
      } catch (e) {
        console.warn('Impossible de charger la liste employés pour navigation', e)
      }
    })()
  }, [employesListProp, isNew])

  // Si l'employé courant change (via ◀ ▶), re-synchroniser le formulaire
  useEffect(() => {
    if (!currentEmploye) return
    setForm(initForm(currentEmploye))
    setError(null)
    requestAnimationFrame(() => {
      const m = document.getElementById('emp-edit-modal-body')
      if (m) m.scrollTop = 0
    })
  }, [currentEmploye?.id])

  // Si l'employé passé en prop change (depuis le parent), suivre
  useEffect(() => {
    setCurrentEmploye(employe)
  }, [employe?.id])

  // ━━━ Navigation ◀ ▶ ━━━
  const canNavigate = !isNew && Array.isArray(employesList) && employesList.length > 1 && currentEmploye

  function goPrev() {
    if (!canNavigate) return
    const idx = employesList.findIndex(e => e.id === currentEmploye.id)
    if (idx === -1) return
    const newEmp = employesList[(idx - 1 + employesList.length) % employesList.length]
    if (onNavigate) onNavigate(newEmp)
    else setCurrentEmploye(newEmp)
  }

  function goNext() {
    if (!canNavigate) return
    const idx = employesList.findIndex(e => e.id === currentEmploye.id)
    if (idx === -1) return
    const newEmp = employesList[(idx + 1) % employesList.length]
    if (onNavigate) onNavigate(newEmp)
    else setCurrentEmploye(newEmp)
  }

  // Raccourcis clavier ← →
  useEffect(() => {
    if (!canNavigate) return
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canNavigate, currentEmploye?.id, employesList])

  const positionInfo = canNavigate
    ? (() => {
        const idx = employesList.findIndex(e => e.id === currentEmploye.id)
        return idx >= 0 ? `${idx + 1} / ${employesList.length}` : ''
      })()
    : ''

  function setF(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (!form.nom.trim()) { setError('Le nom est obligatoire'); return }
    if (!form.societe_id) { setError('La société est obligatoire'); return }

    setSaving(true); setError(null)
    try {
      const data = {
        nom: form.nom.trim(),
        nom_arabe: form.nom_arabe.trim() || null,
        cnss: form.cnss.trim() || null,
        cin: form.cin.trim() || null,
        poste: form.poste.trim() || null,
        groupe: form.groupe || null,
        type_contrat: form.type_contrat,
        date_entree: form.date_entree || null,
        date_anciennete: form.date_anciennete || null,
        date_sortie: form.date_sortie || null,
        salaire_net: form.salaire_net ? parseFloat(form.salaire_net) : null,
        adresse: form.adresse.trim() || null,
        rib: form.rib.trim() || null,
        banque: form.banque.trim() || null,
        actif: form.actif,
        notes: form.notes.trim() || null,
        planning_type: form.planning_type || 'aucun',
        planning_jour_off: form.planning_jour_off || null,
        planning_demi_off: form.planning_demi_off || null,
        planning_paire_off_1: form.planning_paire_off_1 || null,
        planning_paire_off_2: form.planning_paire_off_2 || null,
        planning_impaire_off_1: form.planning_impaire_off_1 || null,
        planning_impaire_off_2: form.planning_impaire_off_2 || null,
        equipe: form.equipe || 'normale',
        heures_jour_complet: form.heures_jour_complet ? parseFloat(form.heures_jour_complet) : 8.50,
        heures_demi_journee: form.heures_demi_journee ? parseFloat(form.heures_demi_journee) : 4.00,
        nom_odoo_match: form.nom_odoo_match.trim() || null,
        heures_sup_mensuelles: form.heures_sup_mensuelles,
        societe_id: form.societe_id || null,
        declare: form.declare,
        telephone: form.telephone.trim() || null,
        contact_urgence_1_nom: form.contact_urgence_1_nom.trim() || null,
        contact_urgence_1_telephone: form.contact_urgence_1_telephone.trim() || null,
        contact_urgence_2_nom: form.contact_urgence_2_nom.trim() || null,
        contact_urgence_2_telephone: form.contact_urgence_2_telephone.trim() || null,
        lieu_urgence: form.lieu_urgence || null,
        lieu_urgence_nom: form.lieu_urgence_nom.trim() || null,
      }
      if (isNew) {
        const created = await createEmploye(data, user.id)
        // Création auto du user (sans permission) + envoi des accès par WhatsApp.
        try {
          const r = await createUserForEmploye(created)
          if (r.ok) {
            alert(`Employé et user créés ✅\n\nLogin : ${r.username}\nMot de passe : ${r.password}\n\n(À communiquer à l'employé.)`)
          } else {
            alert(`Employé créé, mais user NON créé : ${r.reason}.\n(Tu pourras réessayer via « Créer les users manquants ».)`)
          }
        } catch (e) {
          alert('Employé créé, mais erreur création user : ' + (e?.message || ''))
        }
      } else {
        await updateEmploye(currentEmploye.id, data, user.id)
        // Propagation du téléphone vers le user lié (s'il existe).
        // Le format est normalisé en 212XXXXXXXXX pour WATI.
        const tel = normalizePhoneMA(data.telephone)
        if (tel) {
          try {
            await supabase.from('profiles').update({ whatsapp: tel }).eq('employe_id', currentEmploye.id)
          } catch (e) {
            console.warn('[propagate-tel-user]', e?.message || e)
          }
        }
        // Départ employé (inactif ou date de sortie) → on désactive son user.
        if (data.actif === false || data.date_sortie) {
          try { await deactivateUserForEmploye(currentEmploye.id) } catch (e) { console.warn('[deactivate-user]', e?.message || e) }
        }
      }
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Erreur')
      setSaving(false)
    }
  }

  const displayedEmploye = currentEmploye || employe

  return (
    <div style={overlay} onClick={onClose}>
      <div id="emp-edit-modal-body" style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
          {canNavigate ? (
            <button type="button" onClick={goPrev} style={btnNav} title="Employé précédent (←)">◀</button>
          ) : <span style={{ width: 36 }} />}

          <h3 style={{
            margin: 0, fontSize: 16, fontWeight: 500, color: '#1a0f0a',
            flex: 1, textAlign: 'center',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {isNew ? (
              <><Plus size={16} /> Nouvel employé</>
            ) : (
              <><Pencil size={16} /> {displayedEmploye?.nom || ''}</>
            )}
            {positionInfo && (
              <span style={{ fontSize: 11, color: '#8a7a70', marginLeft: 8, fontWeight: 400 }}>
                ({positionInfo})
              </span>
            )}
          </h3>

          {canNavigate ? (
            <button type="button" onClick={goNext} style={btnNav} title="Employé suivant (→)">▶</button>
          ) : <span style={{ width: 36 }} />}

          <button onClick={onClose} style={btnClose} title="Fermer">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <Row>
            <div>
              <label style={lblStyle}>Société *</label>
              <select
                value={form.societe_id || ''}
                onChange={e => setF('societe_id', e.target.value ? Number(e.target.value) : null)}
                style={{
                  ...inputStyle,
                  borderColor: form.societe_id ? '#e5d8c3' : '#F5BFBC',
                  background: form.societe_id ? 'white' : '#FCEEE8',
                }}
                required
              >
                <option value="">— Choisir la société —</option>
                {societes.map(s => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </div>
            <div />
          </Row>
          <Row>
            <Field label="Nom complet *" value={form.nom} onChange={v => setF('nom', v)} required autoFocus />
            <Field label="Poste" value={form.poste} onChange={v => setF('poste', v)} placeholder="Pâtissière" />
          </Row>
          <Row>
            <div>
              <label style={lblStyle}>Groupe</label>
              <select value={form.groupe || ''} onChange={e => setF('groupe', e.target.value)} style={inputStyle}>
                <option value="">— Choisir un groupe —</option>
                {EMPLOYE_GROUPES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div />
          </Row>
          <Row>
            <Field label="N° CNSS" value={form.cnss} onChange={v => setF('cnss', v)} placeholder="182572887" />
            <Field label="N° CIN" value={form.cin} onChange={v => setF('cin', v)} placeholder="A394604" />
          </Row>
          {isAdmin && (
            <Row>
              <div>
                <label style={lblStyle}>Type de contrat</label>
                <select value={form.type_contrat} onChange={e => setF('type_contrat', e.target.value)} style={inputStyle}>
                  {TYPES_CONTRAT.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <Field label="Salaire net (DH)" type="number" value={form.salaire_net} onChange={v => setF('salaire_net', v)} placeholder="8500" />
            </Row>
          )}
          <Row>
            <Field label="Date d'entrée (fiche de salaire)" type="date" value={form.date_entree} onChange={v => setF('date_entree', v)} />
            <div>
              <Field label="Date d'ancienneté (manuelle)" type="date" value={form.date_anciennete} onChange={v => setF('date_anciennete', v)} />
              <div style={{ fontSize: 10, color: '#8a7a70', marginTop: 2 }}>
                Si renseignée, sert au calcul du quota congés (prime sur la date d'entrée).
              </div>
            </div>
          </Row>
          <Row>
            {isAdmin ? (
              <Field label="Date de sortie (si parti)" type="date" value={form.date_sortie} onChange={v => setF('date_sortie', v)} />
            ) : <div />}
            <div />
          </Row>

          <Row>
            <div>
              <label style={lblStyle}>Nom en arabe (pour contrats)</label>
              <input
                type="text"
                value={form.nom_arabe || ''}
                onChange={e => setF('nom_arabe', e.target.value)}
                placeholder="مثال : أسماء العبادي"
                style={{ ...inputStyle, direction: 'rtl', fontFamily: 'Arial, sans-serif' }}
              />
            </div>
            <Field label="Adresse" value={form.adresse} onChange={v => setF('adresse', v)} placeholder="Ex : 12 rue X, Quartier Y, Rabat" />
          </Row>

          <Row>
            <Field label="RIB (numéro de compte)" value={form.rib} onChange={v => setF('rib', v)} placeholder="Ex : 011 810 0000123456789 12" />
            <Field label="Banque" value={form.banque} onChange={v => setF('banque', v)} placeholder="Ex : Attijariwafa Bank, BMCE…" />
          </Row>

          <div style={{ background: '#FCEEE8', padding: 12, borderRadius: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Contact & urgence
            </div>
            <Row>
              <Field label="Téléphone (employé)" value={form.telephone} onChange={v => setF('telephone', v)} placeholder="Ex : 06 12 34 56 78" />
              <div>
                <label style={lblStyle}>Lieu en cas d'urgence grave</label>
                <select value={form.lieu_urgence} onChange={e => setF('lieu_urgence', e.target.value)} style={inputStyle}>
                  <option value="">— non défini —</option>
                  <option value="clinique">Clinique</option>
                  <option value="hopital_public">Hôpital public</option>
                  <option value="famille">Appeler la famille</option>
                </select>
              </div>
            </Row>
            {(form.lieu_urgence === 'clinique' || form.lieu_urgence === 'hopital_public') && (
              <Row>
                <Field
                  label={form.lieu_urgence === 'clinique' ? 'Nom de la clinique' : "Nom de l'hôpital"}
                  value={form.lieu_urgence_nom}
                  onChange={v => setF('lieu_urgence_nom', v)}
                  placeholder={form.lieu_urgence === 'clinique' ? 'Ex : Clinique Atlas, Rabat' : 'Ex : CHU Ibn Sina, Rabat'}
                />
                <div />
              </Row>
            )}
            <Row>
              <Field label="Contact urgence 1 — nom" value={form.contact_urgence_1_nom} onChange={v => setF('contact_urgence_1_nom', v)} placeholder="Ex : Mère, frère, conjoint(e)" />
              <Field label="Contact urgence 1 — téléphone" value={form.contact_urgence_1_telephone} onChange={v => setF('contact_urgence_1_telephone', v)} placeholder="Ex : 06 11 22 33 44" />
            </Row>
            <Row>
              <Field label="Contact urgence 2 — nom" value={form.contact_urgence_2_nom} onChange={v => setF('contact_urgence_2_nom', v)} placeholder="(optionnel)" />
              <Field label="Contact urgence 2 — téléphone" value={form.contact_urgence_2_telephone} onChange={v => setF('contact_urgence_2_telephone', v)} placeholder="(optionnel)" />
            </Row>
          </div>

          <div style={{ background: '#F4F0EA', padding: 12, borderRadius: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> Planning de travail (pour calcul du pointage)
            </div>

            <Row>
              <div>
                <label style={lblStyle}>Type de planning</label>
                <select value={form.planning_type} onChange={e => setF('planning_type', e.target.value)} style={inputStyle}>
                  <option value="aucun">Aucun planning</option>
                  <option value="fixe">Fixe (mêmes jours off chaque semaine)</option>
                  <option value="alt">Alternant (paire/impaire)</option>
                </select>
              </div>
              <div>
                <label style={lblStyle}>Équipe</label>
                <select value={form.equipe} onChange={e => setF('equipe', e.target.value)} style={inputStyle}>
                  <option value="normale">Normale (8h30/jour)</option>
                  <option value="cafe">Café (8h si pause / 9h sans pause)</option>
                </select>
              </div>
            </Row>

            {form.planning_type === 'fixe' && (
              <Row>
                <div>
                  <label style={lblStyle}>Journée OFF</label>
                  <select value={form.planning_jour_off} onChange={e => setF('planning_jour_off', e.target.value)} style={inputStyle}>
                    <option value="">— Aucun —</option>
                    {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Demi-journée OFF</label>
                  <select value={form.planning_demi_off} onChange={e => setF('planning_demi_off', e.target.value)} style={inputStyle}>
                    <option value="">— Aucune —</option>
                    {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              </Row>
            )}

            {form.planning_type === 'alt' && (
              <>
                <Row>
                  <div>
                    <label style={lblStyle}>Semaine paire — OFF jour 1</label>
                    <select value={form.planning_paire_off_1} onChange={e => setF('planning_paire_off_1', e.target.value)} style={inputStyle}>
                      <option value="">— Aucun —</option>
                      {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lblStyle}>Semaine paire — OFF jour 2</label>
                    <select value={form.planning_paire_off_2} onChange={e => setF('planning_paire_off_2', e.target.value)} style={inputStyle}>
                      <option value="">— Aucun —</option>
                      {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                </Row>
                <Row>
                  <div>
                    <label style={lblStyle}>Semaine impaire — OFF jour 1</label>
                    <select value={form.planning_impaire_off_1} onChange={e => setF('planning_impaire_off_1', e.target.value)} style={inputStyle}>
                      <option value="">— Aucun —</option>
                      {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lblStyle}>Semaine impaire — OFF jour 2</label>
                    <select value={form.planning_impaire_off_2} onChange={e => setF('planning_impaire_off_2', e.target.value)} style={inputStyle}>
                      <option value="">— Aucun —</option>
                      {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                </Row>
              </>
            )}

            <Row>
              <Field label="Heures journée complète (h)" type="number" value={form.heures_jour_complet} onChange={v => setF('heures_jour_complet', v)} placeholder="8.50" />
              <Field label="Heures demi-journée (h)" type="number" value={form.heures_demi_journee} onChange={v => setF('heures_demi_journee', v)} placeholder="4.00" />
            </Row>

            <Field label="Nom Odoo complet (avec préfixe PA-, PC-, etc. pour matching pointages)" value={form.nom_odoo_match} onChange={v => setF('nom_odoo_match', v)} placeholder="Ex : PA- Asmae El Abbadi" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lblStyle}>Notes (interne)</label>
            <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2} placeholder="Remarques…"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {isAdmin && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: '#FCEEE8', borderRadius: 8, cursor: 'pointer', marginBottom: 10
            }}>
              <input type="checkbox" checked={form.heures_sup_mensuelles} onChange={e => setF('heures_sup_mensuelles', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#993556', cursor: 'pointer' }} />
              <span style={{ fontSize: 13, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Lock size={14} /> Heures sup mensuelles payées (décocher si forfait ou autre)
              </span>
            </label>
          )}

          {isAdmin && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: '#F9F6F1', borderRadius: 8, cursor: 'pointer', marginBottom: 14
            }}>
              <input type="checkbox" checked={form.actif} onChange={e => setF('actif', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#993556', cursor: 'pointer' }} />
              <span style={{ fontSize: 13, color: '#1a0f0a' }}>Employé actif (décocher si parti)</span>
            </label>
          )}

          {isAdmin && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: form.declare ? '#EAF3DE' : '#F9F6F1',
              borderRadius: 8, cursor: 'pointer', marginBottom: 14,
              border: form.declare ? '1px solid #C0DD97' : '1px solid transparent',
            }}>
              <input type="checkbox" checked={form.declare} onChange={e => setF('declare', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#27500A', cursor: 'pointer' }} />
              <span style={{ fontSize: 13, color: form.declare ? '#27500A' : '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> <strong>Déclaré</strong> (CNSS — apparaît dans Salaires)
              </span>
            </label>
          )}

          {error && (
            <div style={{
              padding: '8px 12px', background: '#FCE9E8', color: '#99201E',
              borderRadius: 6, fontSize: 12, marginBottom: 12
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={saving} style={btnSecondary}>Annuler</button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Enregistrement…' : (isNew ? 'Créer' : 'Enregistrer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Helper : init form depuis un employé
function initForm(employe) {
  return {
    nom: employe?.nom || '',
    nom_arabe: employe?.nom_arabe || '',
    cnss: employe?.cnss || '',
    cin: employe?.cin || '',
    poste: employe?.poste || '',
    groupe: employe?.groupe || '',
    type_contrat: employe?.type_contrat || 'CDI',
    date_entree: employe?.date_entree || '',
    date_anciennete: employe?.date_anciennete || '',
    date_sortie: employe?.date_sortie || '',
    salaire_net: employe?.salaire_net != null ? String(employe.salaire_net) : '',
    adresse: employe?.adresse || '',
    rib: employe?.rib || '',
    banque: employe?.banque || '',
    actif: employe?.actif != null ? employe.actif : true,
    notes: employe?.notes || '',
    planning_type: employe?.planning_type || 'aucun',
    planning_jour_off: employe?.planning_jour_off || '',
    planning_demi_off: employe?.planning_demi_off || '',
    planning_paire_off_1: employe?.planning_paire_off_1 || '',
    planning_paire_off_2: employe?.planning_paire_off_2 || '',
    planning_impaire_off_1: employe?.planning_impaire_off_1 || '',
    planning_impaire_off_2: employe?.planning_impaire_off_2 || '',
    equipe: employe?.equipe || 'normale',
    heures_jour_complet: employe?.heures_jour_complet != null ? String(employe.heures_jour_complet) : '8.50',
    heures_demi_journee: employe?.heures_demi_journee != null ? String(employe.heures_demi_journee) : '4.00',
    nom_odoo_match: employe?.nom_odoo_match || '',
    heures_sup_mensuelles: employe?.heures_sup_mensuelles != null ? employe.heures_sup_mensuelles : true,
    societe_id: employe?.societe_id || null,
    declare: employe?.declare != null ? employe.declare : false,
    telephone: employe?.telephone || '',
    contact_urgence_1_nom: employe?.contact_urgence_1_nom || '',
    contact_urgence_1_telephone: employe?.contact_urgence_1_telephone || '',
    contact_urgence_2_nom: employe?.contact_urgence_2_nom || '',
    contact_urgence_2_telephone: employe?.contact_urgence_2_telephone || '',
    lieu_urgence: employe?.lieu_urgence || '',
    lieu_urgence_nom: employe?.lieu_urgence_nom || '',
  }
}

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>{children}</div>
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false, autoFocus = false }) {
  return (
    <div>
      <label style={lblStyle}>{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required} autoFocus={autoFocus} style={inputStyle} />
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, overflow: 'auto' }
const modal = { background: 'white', borderRadius: 16, padding: 22, maxWidth: 560, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70', marginLeft: 4 }
const btnNav = { width: 36, height: 32, background: '#F4F0EA', border: '1px solid #e5d8c3', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#1a0f0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
const lblStyle = { display: 'block', fontSize: 11, fontWeight: 500, color: '#4a3a30', marginBottom: 4 }
const inputStyle = { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6, background: 'white', fontFamily: 'inherit', boxSizing: 'border-box' }
const btnSecondary = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', color: '#4a3a30' }
const btnPrimary = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
