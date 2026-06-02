import { useState, useEffect, useRef } from 'react'
import { Search, SearchX, Wallet, Mail, HandCoins, Banknote, Hash, Calendar, Type } from 'lucide-react'
import { searchCaisse } from '../../lib/caisse'
import { fmtMoney, fmtDateLongue, COLOR_PALETTE } from './_helpers'

const KIND_META = {
  mouvement: { Icon: Wallet,    label: 'Mouvement' },
  enveloppe: { Icon: Mail,      label: 'Enveloppe' },
  avance:    { Icon: HandCoins, label: 'Avance'    },
  salaire:   { Icon: Banknote,  label: 'Salaire'   },
}

const QUERY_TYPE_HINT = {
  amount: { Icon: Hash,     label: 'Recherche par montant' },
  date:   { Icon: Calendar, label: 'Recherche par date'    },
  text:   { Icon: Type,     label: 'Recherche par texte'   },
}

function HintIcon({ type }) { const I = (QUERY_TYPE_HINT[type] || QUERY_TYPE_HINT.text).Icon; return <I size={13} /> }
function KindIcon({ kind }) { const I = (KIND_META[kind] || KIND_META.mouvement).Icon; return <I size={12} /> }

export default function RechercheView({ user, onGoToSource }) {
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
            border: '1px solid #e5d8c3',
            background: 'white',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = '#993556'}
          onBlur={e => e.target.style.borderColor = '#e5d8c3'}
        />
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#4a3a30', display: 'flex' }}><Search size={18} /></div>
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: '#F4F0EA', border: 'none', borderRadius: 999,
              width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#4a3a30',
            }}
            title="Effacer"
          >✕</button>
        )}
      </div>

      {/* Hint type de query + compteurs */}
      {results && !loading && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          fontSize: 12, color: '#4a3a30', marginBottom: 14,
        }}>
          <span style={{
            padding: '4px 10px', borderRadius: 999, background: '#F4F0EA',
            display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
          }}>
            <HintIcon type={results.queryType} /> {(QUERY_TYPE_HINT[results.queryType] || QUERY_TYPE_HINT.text).label}
          </span>
          <span style={{ fontWeight: 500, color: '#1a0f0a' }}>
            {results.counts.total} résultat{results.counts.total > 1 ? 's' : ''}
          </span>
          {results.counts.total > 0 && (
            <span style={{ color: '#8a7a70' }}>
              · {results.counts.mouvement} mvt · {results.counts.enveloppe} env · {results.counts.avance} av · {results.counts.salaire} sal
            </span>
          )}
        </div>
      )}

      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#4a3a30' }}>
          Recherche en cours…
        </div>
      )}

      {!query.trim() && !loading && (
        <div style={{
          padding: '60px 20px', textAlign: 'center', color: '#4a3a30',
          background: '#F9F6F1', borderRadius: 16, border: '0.5px dashed #e5d8c3',
        }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: '#993556' }}><Search size={32} /></div>
          <div style={{ fontSize: 14, marginBottom: 6, color: '#1a0f0a', fontWeight: 500 }}>
            Recherche transversale
          </div>
          <div style={{ fontSize: 12, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
            Cherche dans toutes les caisses (Meriem, Layla LG, Hamid), les enveloppes,
            les avances et les salaires.
          </div>
          <div style={{ fontSize: 11, marginTop: 14, color: '#8a7a70' }}>
            Exemples : <strong>250</strong> · <strong>22/05/2026</strong> · <strong>fleuriste</strong> · <strong>nezha</strong>
          </div>
        </div>
      )}

      {results && results.results.length === 0 && !loading && (
        <div style={{
          padding: 40, textAlign: 'center', color: '#4a3a30',
          background: '#F9F6F1', borderRadius: 16,
        }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: '#8a7a70' }}><SearchX size={26} /></div>
          Aucun résultat pour <strong>« {query} »</strong>
        </div>
      )}

      {results && results.results.length > 0 && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {results.results.map(r => (
            <ResultRow key={r.id} r={r} onClick={onGoToSource ? () => onGoToSource(r) : null} />
          ))}
        </div>
      )}
    </div>
  )
}

function ResultRow({ r, onClick }) {
  const meta = KIND_META[r.kind]
  const c = COLOR_PALETTE[r.colorKey] || COLOR_PALETTE.gris

  const amountStyle = {
    fontWeight: 500,
    textAlign: 'right',
    fontSize: 13,
    color: r.type === 'sortie' ? '#99201E' : r.type === 'entree' ? '#085041' : '#1a0f0a',
    whiteSpace: 'nowrap',
  }
  const sign = r.type === 'sortie' ? '− ' : r.type === 'entree' ? '+ ' : ''

  return (
    <div
      onClick={onClick || undefined}
      title={onClick ? 'Aller à la source' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '95px 110px 1fr 110px',
        gap: 12,
        alignItems: 'center',
        padding: '13px 16px',
        borderRadius: 14,
        background: 'white',
        border: '0.5px solid #e5d8c3',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
        boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#FFFAF3'}
      onMouseLeave={e => e.currentTarget.style.background = 'white'}
    >
      <div style={{ fontSize: 12, color: '#4a3a30' }}>
        {fmtDateLongue(r.date)}
      </div>
      <div>
        <span style={{
          fontSize: 11, padding: '3px 9px', borderRadius: 999,
          background: c.bg, color: c.text, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          whiteSpace: 'nowrap',
        }}>
          <KindIcon kind={r.kind} /> {meta.label}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#1a0f0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.label}
        </div>
        <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.sublabel}
        </div>
      </div>
      <div style={amountStyle}>
        {sign}{fmtMoney(r.amount)}
      </div>
    </div>
  )
}
