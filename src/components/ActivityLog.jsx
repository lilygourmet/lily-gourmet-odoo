import { useEffect, useState } from 'react'

// ============================================================
// ActivityLog : footer fixe avec liste scrollable des logs
// Props :
//   loadFn : async () => array de logs
//   formatEntry : (log) => string ou JSX
//   refreshKey : value qui change pour forcer le reload
// ============================================================
export default function ActivityLog({ loadFn, formatEntry, refreshKey }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const data = await loadFn()
      setLogs(data || [])
    } catch (e) {
      console.error('[ActivityLog]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [refreshKey])

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-cream/95 backdrop-blur-sm border-t border-line shadow-[0_-4px_12px_rgba(0,0,0,0.04)] z-20">
      <div className="max-w-3xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-bordeaux font-bold">
            📋 Activité (14 jours)
          </span>
          <span className="text-[10px] text-ink-mute">
            {logs.length} action{logs.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="max-h-[100px] overflow-y-auto space-y-0.5 pr-1">
          {loading && logs.length === 0 ? (
            <div className="text-[11px] text-ink-mute italic">Chargement...</div>
          ) : logs.length === 0 ? (
            <div className="text-[11px] text-ink-mute italic">Aucune action récente</div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="text-[11px] text-ink-soft leading-tight">
                {formatEntry(log)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Helper : "il y a Xmin / Xh / Xj"
export function relativeTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)}j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
