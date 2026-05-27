import { useState, useEffect } from 'react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { saveAs } from 'file-saver'
import { loadBulletins, addBulletinPage, prunePeriods, relabelBulletin, getBulletinSignedUrl, downloadBulletinBytes, deletePeriod } from '../../lib/bulletins'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Mots à ignorer pour deviner le nom de l'employé (en-têtes du bulletin)
const STOP = new Set(['BULLETIN', 'DE', 'PAIE', 'GOURMET', 'RUE', 'SOUMAYA', 'AGDAL', 'RABAT', 'CNS', 'IF', 'MATRICULE', 'NOM', 'PRENOM', 'PRÉNOM', 'DATE', 'NAISSANCE', 'SITUATION', 'FAMILLE', 'ENFANTS', 'DEDUCTIONS', 'DÉDUCTIONS', 'FONCTION', 'EMBAUCHE', 'MUTUELLE', 'NOMBRE', 'COMPTE', 'BANCAIRE', 'RUBRIQUE', 'DESIGNATION', 'DÉSIGNATION', 'BASE', 'TAUX', 'GAINS', 'RETENUES', 'PERIODE', 'PÉRIODE', 'CIMR', 'CIN', 'CNSS', 'SALAIRE', 'NET', 'PAYER', 'BRUT', 'JOURS', 'TRAVAILLES', 'TRAVAILLÉS', 'COTISATION', 'AMO', 'RETENUE', 'TOTAL', 'PAYÉ', 'PAYE', 'CONGE', 'CONGÉ', 'IMPOSABLE', 'GAIN', 'ARRONDI', 'INDEMNITE', 'INDEMNITÉ', 'TRANSPORT', 'PANIER', 'PRIME', 'ANCIENNETE', 'ANCIENNETÉ', 'FRAIS', 'PROFESSIONELS', 'AFFILIATION', 'CELIBATAIRE', 'CÉLIBATAIRE', 'MARIE', 'MARIÉ', 'MARIÉE'])

function parsePage(text) {
  const t = text.replace(/\s+/g, ' ')
  const mat = t.match(/\b0\d{4}\b/)
  const matricule = mat ? mat[0] : null
  // CNSS = nombre de 8 à 10 chiffres (les montants ont une virgule décimale)
  const cnssMatch = t.match(/\b\d{8,10}\b/)
  const cnss = cnssMatch ? cnssMatch[0] : null
  // Net à payer = valeur de la rubrique 4009 (ex. "6 500,00")
  let net = null
  const netMatch = t.match(/4009[^\d]*([\d  .]+,\d{2})/)
  if (netMatch) {
    const n = Number(netMatch[1].replace(/[  .]/g, '').replace(',', '.'))
    if (Number.isFinite(n)) net = n
  }
  // Le nom est juste après l'en-tête de colonne "Retenues", avant le N° CIN.
  // Regex majuscules STRICTES (A-Z + accents MAJUSCULES uniquement, pas les minuscules accentuées)
  const seg = t.split(/Retenues/i)[1] || t
  const capWords = seg.match(/[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'-]+/g) || []
  const nm = []
  for (const w of capWords) {
    if (STOP.has(w)) { if (nm.length) break; else continue }
    nm.push(w)
    if (nm.length >= 4) break
  }
  return { matricule, cnss, net, label: nm.join(' ') }
}

export default function BulletinsTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [progress, setProgress] = useState(null) // { done, total }
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setLoading(true); setError('')
    try { setItems(await loadBulletins()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') { setError('Choisis un fichier PDF.'); return }
    if (!period) { setError('Choisis le mois.'); return }
    setBusy(true); setError(''); setProgress({ done: 0, total: 0 })
    try {
      const buf = await file.arrayBuffer()
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf).slice() }).promise
      const srcDoc = await PDFDocument.load(buf.slice(0), { ignoreEncryption: true })
      const n = pdfjsDoc.numPages
      setProgress({ done: 0, total: n })
      for (let i = 0; i < n; i++) {
        const pg = await pdfjsDoc.getPage(i + 1)
        const tc = await pg.getTextContent()
        const text = tc.items.map(it => it.str).join(' ')
        const parsed = parsePage(text)
        const out = await PDFDocument.create()
        const [cp] = await out.copyPages(srcDoc, [i])
        out.addPage(cp)
        const bytes = await out.save()
        await addBulletinPage(period, parsed, bytes)
        setProgress({ done: i + 1, total: n })
      }
      await prunePeriods(3)
      await refresh()
    } catch (e2) {
      setError('Erreur import : ' + e2.message)
    } finally {
      setBusy(false); setProgress(null)
    }
  }

  async function handleView(path) {
    try { const url = await getBulletinSignedUrl(path); window.open(url, '_blank') }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleRelabel(g) {
    const val = prompt('Nom de l\'employé pour ce bulletin :', g.label)
    if (val === null || !val.trim()) return
    try { await relabelBulletin({ matricule: g.matricule, id: g.rows[0].id, label: val }); await refresh() }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleDownloadEmploye(g) {
    setBusy(true)
    try {
      const periods = [...new Set(g.rows.map(r => r.period))].sort().reverse().slice(0, 3)
      const merged = await PDFDocument.create()
      for (const p of periods) {
        for (const r of g.rows.filter(x => x.period === p)) {
          const bytes = await downloadBulletinBytes(r.storage_path)
          const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
          const pages = await merged.copyPages(doc, doc.getPageIndices())
          pages.forEach(pg => merged.addPage(pg))
        }
      }
      const outBytes = await merged.save()
      saveAs(new Blob([outBytes], { type: 'application/pdf' }), `Bulletins_${g.label}_${periods.join('_')}.pdf`)
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  async function handleDeletePeriod(p) {
    if (!confirm(`Supprimer tous les bulletins de ${p} ?`)) return
    try { await deletePeriod(p); await refresh() }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  // Regroupement par employé (matricule, sinon par id)
  const groups = {}
  for (const r of items) {
    const key = r.matricule || ('id-' + r.id)
    if (!groups[key]) groups[key] = { matricule: r.matricule, label: r.label, rows: [] }
    groups[key].rows.push(r)
    if (r.label && r.label !== 'À identifier') groups[key].label = r.label
  }
  const employes = Object.values(groups).sort((a, b) => (a.label || '').localeCompare(b.label || ''))
  const periodsAll = [...new Set(items.map(r => r.period))].sort().reverse()

  return (
    <div>
      <p className="text-[12px] text-ink-mute mb-3">Le comptable t'envoie le PDF du mois (1 page par employé). Importe-le ici : il est découpé par employé. On garde les 3 derniers mois.</p>

      {/* Import */}
      <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-xl bg-cream-warm border border-line">
        <div>
          <label className="block text-[11px] font-medium text-ink-soft mb-1">Mois du bulletin</label>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux" />
        </div>
        <label className={`px-4 py-2 text-[12px] font-medium rounded-lg cursor-pointer ${busy ? 'bg-line text-ink-mute' : 'bg-bordeaux text-cream hover:bg-bordeaux-deep'}`}>
          {busy ? (progress ? `Import… ${progress.done}/${progress.total}` : 'Import…') : '📥 Importer le PDF du mois'}
          <input type="file" accept="application/pdf" onChange={handleFile} disabled={busy} className="hidden" />
        </label>
        {periodsAll.length > 0 && (
          <div className="text-[11px] text-ink-mute">Mois en mémoire : {periodsAll.join(', ')}</div>
        )}
      </div>

      {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded mb-4 text-[13px]">{error}</div>}
      {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}

      {!loading && employes.length === 0 && (
        <div className="text-center py-12 text-ink-mute italic">Aucun bulletin importé. Choisis le mois et importe le PDF.</div>
      )}

      {/* Liste par employé */}
      <div className="space-y-2">
        {employes.map(g => (
          <div key={g.matricule || g.rows[0].id} className="rounded-xl border border-line bg-cream-warm p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <div className="text-[14px] font-medium text-ink">
                {g.label}{g.matricule ? <span className="text-[11px] text-ink-mute font-normal"> · {g.matricule}</span> : ''}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {g.rows.sort((a, b) => b.period.localeCompare(a.period)).map(r => (
                  <button key={r.id} onClick={() => handleView(r.storage_path)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-cream border border-line text-ink-soft hover:border-bordeaux" title="Voir le bulletin">
                    {r.period}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => handleRelabel(g)} className="text-[11px] text-ink-soft hover:text-bordeaux px-2" title="Corriger le nom">✎ Nom</button>
            <button onClick={() => handleDownloadEmploye(g)} disabled={busy}
              className="px-3 py-1.5 text-[12px] font-medium bg-bordeaux text-cream rounded-full hover:bg-bordeaux-deep disabled:opacity-50">
              📥 3 derniers mois
            </button>
          </div>
        ))}
      </div>

      {/* Gestion des mois */}
      {periodsAll.length > 0 && (
        <div className="mt-6">
          <div className="text-[11px] font-medium text-ink-mute uppercase tracking-wider mb-2">Mois stockés</div>
          <div className="flex flex-wrap gap-2">
            {periodsAll.map(p => (
              <span key={p} className="inline-flex items-center gap-2 text-[12px] px-3 py-1 rounded-full bg-cream-warm border border-line">
                {p}
                <button onClick={() => handleDeletePeriod(p)} className="text-bordeaux" title="Supprimer ce mois">🗑️</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
