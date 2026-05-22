import { useState, useEffect, useRef } from 'react'
import { searchCaisse } from '../../lib/caisse'
import { fmtMoney, fmtDateLongue, COLOR_PALETTE } from './_helpers'

const KIND_META = {
  mouvement: { emoji: '💰', label: 'Mouvement' },
  enveloppe: { emoji: '📊', label: 'Enveloppe' },
  avance:    { emoji: '💸', label: 'Avance'    },
  salaire:   { emoji: '💵', label: 'Salaire'   },
}

const QUERY_TYPE_HINT = {
  amount: { emoji: '🔢', label: 'Recherche par montant' },
  date:   { emoji: '📅', label: 'Recherche par date'    },
  text:   { emoji: '🔤', label: 'Recherche par texte'   },
}

export default function RechercheView({ user }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchCaisse(query)
        setResults(r)
      } catch (e) {
        console.warn('searchCaisse failed:', e?.message)
        setResults({ results: [], counts: { total: 0 }, queryType: 'text' })
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  return (
    <div>
      {/* Champ de recherche */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Tape un montant (ex: 250), une date (ex: 22/05/2026) ou un mot…"
          style={{
            width: '100%',
            fontSize: 15,
            padding: '14px 44px 14px 44px',
            borderRadius: 10,
            border: '1px solid #E8E2D8',
            background: 'white',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = '#993556'}
          onBlur={e => e.target.style.borderColor = '#E8E2D8'}
        />
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: '#6F6A60' }}>🔍</div>
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: '#F4F0EA', border: 'none', borderRadius: 999,
              width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#6F6A60',
            }}
            title="Effacer"
          >✕</button>
        )}
      </div>

      {/* Hint type de query + compteurs */}
      {results && !loading && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          fontSize: 12, color: '#6F6A60', marginBottom: 14,
        }}>
          <span style={{
            padding: '4px 10px', borderRadius: 999, background: '#F4F0EA',
            display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
          }}>
            {QUERY_TYPE_HINT[results.queryType].emoji} {QUERY_TYPE_HINT[results.queryType].label}
          </span>
          <span style={{ fontWeight: 500, color: '#3A3733' }}>
            {results.counts.total} résultat{results.counts.total > 1 ? 's' : ''}
          </span>
          {results.counts.total > 0 && (
            <span style={{ color: '#9B968D' }}>
              · {results.counts.mouvement} mvt · {results.counts.enveloppe} env · {results.counts.avance} av · {results.counts.salaire} sal
            </span>
          )}
        </div>
      )}

      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#6F6A60' }}>
          Recherche en cours…
        </div>
      )}

      {!query.trim() && !loading && (
        <div style={{
          padding: '60px 20px', textAlign: 'center', color: '#6F6A60',
          background: '#F9F6F1', borderRadius: 10, border: '0.5px dashed #E8E2D8',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, marginBottom: 6, color: '#3A3733', fontWeight: 500 }}>
            Recherche transversale
          </div>
          <div style={{ fontSize: 12, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
            Cherche dans toutes les caisses (Meriem, Layla LG, Hamid), les enveloppes,
            les avances et les salaires.
          </div>
          <div style={{ fontSize: 11, marginTop: 14, color: '#9B968D' }}>
            Exemples : <strong>250</strong> · <strong>22/05/2026</strong> · <strong>fleuriste</strong> · <strong>nezha</strong>
          </div>
        </div>
      )}

      {results && results.results.length === 0 && !loading && (
        <div style={{
          padding: 40, textAlign: 'center', color: '#6F6A60',
          background: '#F9F6F1', borderRadius: 10,
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🤷</div>
          Aucun résultat pour <strong>« {query} »</strong>
        </div>
      )}

      {results && results.results.length > 0 && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {results.results.map(r => (
            <ResultRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function ResultRow({ r }) {
  const meta = KIND_META[r.kind]
  const c = COLOR_PALETTE[r.colorKey] || COLOR_PALETTE.gris

  const amountStyle = {
    fontWeight: 500,
    textAlign: 'right',
    fontSize: 13,
    color: r.type === 'sortie' ? '#99201E' : r.type === 'entree' ? '#085041' : '#3A3733',
    whiteSpace: 'nowrap',
  }
  const sign = r.type === 'sortie' ? '− ' : r.type === 'entree' ? '+ ' : ''

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '95px 110px 1fr 110px',
        gap: 12,
        alignItems: 'center',
        padding: '11px 14px',
        borderRadius: 8,
        background: 'white',
        border: '0.5px solid #E8E2D8',
        cursor: 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#FFFAF3'}
      onMouseLeave={e => e.currentTarget.style.background = 'white'}
    >
      <div style={{ fontSize: 12, color: '#6F6A60' }}>
        {fmtDateLongue(r.date)}
      </div>
      <div>
        <span style={{
          fontSize: 11, padding: '3px 9px', borderRadius: 999,
          background: c.bg, color: c.text, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          whiteSpace: 'nowrap',
        }}>
          {meta.emoji} {meta.label}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#3A3733', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.label}
        </div>
        <div style={{ fontSize: 11, color: '#9B968D', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.sublabel}
        </div>
      </div>
      <div style={amountStyle}>
        {sign}{fmtMoney(r.amount)}
      </div>
    </div>
  )
}
