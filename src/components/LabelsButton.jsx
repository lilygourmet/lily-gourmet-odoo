import { useState, useEffect } from 'react'
import { toast } from '../lib/toast'

export default function LabelsButton() {
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState({})  // { date: count }
  const [selected, setSelected] = useState({})  // { date: true/false }
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [downloading, setDownloading] = useState(false)

  function getDates() {
    const d = new Date()
    const j0 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const d1 = new Date(d); d1.setDate(d.getDate() + 1)
    const j1 = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`
    const d2 = new Date(d); d2.setDate(d.getDate() + 2)
    const j2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`
    return [j0, j1, j2]
  }

  function fmtDayLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  async function loadCounts() {
    const dates = getDates()
    setLoadingCounts(true)
    try {
      const r = await fetch(`/api/labels-zpl?dates=${dates.join(',')}&count=1`)
      if (!r.ok) throw new Error(`Erreur ${r.status}`)
      const data = await r.json()
      const map = {}
      for (const c of data.counts) map[c.date] = c.count
      setCounts(map)
    } catch (e) {
      console.error('[labels] count error:', e)
      toast.error('Erreur au comptage : ' + e.message)
    } finally {
      setLoadingCounts(false)
    }
  }

  async function downloadSelected() {
    const dates = Object.keys(selected).filter(d => selected[d])
    if (dates.length === 0) {
      toast.error('Sélectionne au moins un jour')
      return
    }
    setDownloading(true)
    try {
      const r = await fetch(`/api/labels-zpl?dates=${dates.join(',')}`)
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(`Erreur ${r.status} : ${txt}`)
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const fname = dates.length === 1
        ? `etiquettes-${dates[0]}.zpl`
        : `etiquettes-${dates[0]}_a_${dates[dates.length - 1]}.zpl`
      a.download = fname
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  function toggleDate(date) {
    setSelected(prev => ({ ...prev, [date]: !prev[date] }))
  }

  useEffect(() => {
    if (open) {
      setSelected({})
      loadCounts()
    }
  }, [open])

  const dates = getDates()
  const items = [
    { date: dates[0], label: "Aujourd'hui", detail: fmtDayLabel(dates[0]) },
    { date: dates[1], label: 'Demain', detail: fmtDayLabel(dates[1]) },
    { date: dates[2], label: 'Après-demain', detail: fmtDayLabel(dates[2]) },
  ]

  const totalSelected = Object.entries(selected)
    .filter(([d, v]) => v)
    .reduce((sum, [d]) => sum + (counts[d] || 0), 0)
  const nbDaysSelected = Object.values(selected).filter(Boolean).length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-2.5 py-1.5 border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream rounded-full text-[10px] font-medium tracking-wider transition-all flex-shrink-0"
        title="Imprimer les étiquettes CD du jour (Zebra)"
      >
        Étiquettes CD
      </button>

      {open && (
        <>
          {/* Backdrop transparent pour fermer au clic exterieur */}
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />

          {/* Dropdown ancre sous le bouton */}
          <div className="absolute right-0 top-full mt-2 z-[80] w-[300px] bg-cream rounded-xl shadow-2xl border border-line p-3"
               onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[15px] text-ink mb-1">Étiquettes CD</h3>
            <p className="text-[10px] text-ink-mute mb-3">
              Coche les jours à imprimer.
            </p>

            <div className="space-y-1.5">
              {items.map(item => {
                const count = counts[item.date]
                const isChecked = !!selected[item.date]
                const isEmpty = count === 0
                return (
                  <button
                    key={item.date}
                    onClick={() => !isEmpty && toggleDate(item.date)}
                    disabled={isEmpty || loadingCounts}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded border text-left transition-colors ${
                      isEmpty
                        ? 'bg-cream-warm/30 border-line/40 text-ink-mute cursor-not-allowed'
                        : isChecked
                        ? 'bg-bordeaux/10 border-bordeaux'
                        : 'bg-cream-warm border-line hover:border-bordeaux hover:bg-bordeaux/5'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] ${
                      isChecked ? 'bg-bordeaux border-bordeaux text-cream' : 'border-line bg-cream'
                    }`}>
                      {isChecked ? '✓' : ''}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-ink leading-tight">{item.label}</div>
                      <div className="text-[10px] text-ink-mute capitalize leading-tight">{item.detail}</div>
                    </div>
                    <div className="flex-shrink-0">
                      {loadingCounts ? (
                        <span className="text-[9px] text-ink-mute italic">...</span>
                      ) : count === undefined ? (
                        <span className="text-[9px] text-ink-mute">?</span>
                      ) : count === 0 ? (
                        <span className="text-[9px] text-ink-mute">Aucune</span>
                      ) : (
                        <span className="font-mono text-[11px] text-bordeaux font-bold">{count}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {nbDaysSelected > 0 && (
              <div className="mt-2 px-2 py-1.5 bg-bordeaux/5 border border-bordeaux/20 rounded text-[11px] text-bordeaux">
                <span className="font-bold">{totalSelected}</span> étiquettes / <span className="font-bold">{nbDaysSelected}</span> jour{nbDaysSelected > 1 ? 's' : ''}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-1.5 border border-line rounded-full text-[11px] text-ink-soft hover:bg-cream-warm"
              >Annuler</button>
              <button
                onClick={downloadSelected}
                disabled={downloading || totalSelected === 0}
                className={`flex-1 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                  totalSelected === 0 || downloading
                    ? 'bg-line/40 text-ink-mute cursor-not-allowed'
                    : 'bg-bordeaux text-cream hover:bg-bordeaux-deep'
                }`}
              >
                {downloading ? '⏳' : '🖨 Télécharger'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
