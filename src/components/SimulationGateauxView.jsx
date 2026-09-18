import { useState } from 'react'
import AppHeader from './AppHeader'
import { computeSizesForCake, SIZE_TABLE, CARRE_TABLE, RECTANGLE_TABLE } from '../lib/cakeSizes'

// Onglet « Simulation gâteaux » : pour un nombre de personnes, montre toutes les
// configurations réalisables (1, 2, 3… étages) avec les vraies tailles Lily Gourmet.
// Le rebord d'un étage passe en orange quand la descente n'est pas homogène.
// Carré et rectangle : un seul étage, tailles lues dans la recette Odoo.

const ECHELLE = 3      // pixels par cm
const H_MAX = 236      // hauteur px dispo pour l'empilement
const ALERTE = '#e2915a'
const CREME = '#f3e9d6'
const CREME2 = '#e8d9bd'
const OR = '#c9a24b'
const BORDEAUX = '#993556'

const CARTE_STYLE = {
  background: '#fff', border: '1px solid #efe7d7', borderRadius: 20, padding: '22px 18px',
  textAlign: 'center', boxShadow: '0 6px 22px rgba(122,31,43,.05)',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
}

const persParCm = cm => (SIZE_TABLE.find(s => s.cm === cm) || {}).pers

function marches(cms) {
  const steps = []
  for (let i = 0; i < cms.length - 1; i++) steps.push(cms[i] - cms[i + 1])
  return { steps, minStep: steps.length ? Math.min(...steps) : 0 }
}
const aUnGap = cms => { const { steps, minStep } = marches(cms); return steps.some(s => s > minStep) }

// cms : diamètres du BAS (plus grand) vers le HAUT
function CakeSvg({ cms }) {
  const svgW = 300, svgH = 250
  const hEt = Math.min(46, H_MAX / cms.length)
  const { minStep } = marches(cms)
  let y = svgH - 14
  const els = []
  const diamBas = cms[0] * ECHELLE
  els.push(<ellipse key="plate" cx={svgW / 2} cy={svgH - 10} rx={diamBas / 2 + 22} ry={10} fill="#efe4cf" />)
  cms.forEach((cm, i) => {
    const w = cm * ECHELLE
    const x = (svgW - w) / 2
    const ry = Math.max(5, w * 0.10)
    const topY = y - hEt
    const fill = i % 2 === 0 ? CREME : CREME2
    const gapLedge = (i < cms.length - 1) && ((cm - cms[i + 1]) > minStep)
    const topFill = gapLedge ? ALERTE : '#fff8ec'
    els.push(<rect key={`b${i}`} x={x} y={topY} width={w} height={hEt} fill={fill} />)
    els.push(<ellipse key={`bo${i}`} cx={svgW / 2} cy={y} rx={w / 2} ry={ry} fill={fill} />)
    els.push(<ellipse key={`t${i}`} cx={svgW / 2} cy={topY} rx={w / 2} ry={ry} fill={topFill} />)
    els.push(<ellipse key={`to${i}`} cx={svgW / 2} cy={topY} rx={w / 2} ry={ry} fill="none" stroke={OR} strokeWidth={1.5} />)
    els.push(
      <text key={`x${i}`} x={svgW / 2} y={topY + hEt / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={12} fill={BORDEAUX} fontFamily="Georgia, serif">{cm} cm</text>
    )
    y = topY
  })
  return <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>{els}</svg>
}

// Plaque vue de dessus : largeur × profondeur en cm
function PlaqueSvg({ larg, prof }) {
  const svgW = 300, svgH = 250
  const ech = Math.min(210 / larg, 180 / prof)
  const w = larg * ech, h = prof * ech
  const x = (svgW - w) / 2, y = (svgH - h) / 2
  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
      <rect x={x + 5} y={y + 7} width={w} height={h} rx={10} fill="#efe4cf" />
      <rect x={x} y={y} width={w} height={h} rx={10} fill={CREME} stroke={OR} strokeWidth={2} />
      <rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} rx={6} fill="#fff8ec" stroke={OR} strokeWidth={1} />
      <text x={svgW / 2} y={svgH / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={15} fill={BORDEAUX} fontFamily="Georgia, serif">{larg} × {prof} cm</text>
      <text x={svgW / 2} y={y - 10} textAnchor="middle" fontSize={11} fill="#8a7d78">{larg} cm</text>
      <text x={x - 10} y={svgH / 2} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#8a7d78"
        transform={`rotate(-90 ${x - 10} ${svgH / 2})`}>{prof} cm</text>
    </svg>
  )
}

function Carte({ nb, cms, n }) {
  const cmsDesc = cms.slice().sort((a, b) => b - a)
  const gap = aUnGap(cmsDesc)
  return (
    <div style={CARTE_STYLE}>
      <h2 className="font-fraunces" style={{ color: BORDEAUX, fontSize: 20, fontWeight: 600, margin: '0 0 2px' }}>
        {nb} étage{nb > 1 ? 's' : ''}
      </h2>
      <div style={{ fontSize: 13, color: '#8a7d78', marginBottom: 14 }}>
        {cmsDesc.length} taille{cmsDesc.length > 1 ? 's' : ''} · {n} parts
      </div>
      <div style={{ height: 250, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <CakeSvg cms={cmsDesc} />
      </div>
      {gap && <div style={{ fontSize: 12, color: ALERTE, marginTop: 2 }}>■ descente irrégulière</div>}
      <div style={{ marginTop: 16, width: '100%', borderTop: '1px dashed #eadfca', paddingTop: 12, fontSize: 13.5 }}>
        {cmsDesc.map((cm, idx) => {
          const num = nb - idx
          const nom = nb === 1 ? 'Gâteau' : num === nb ? 'Étage du bas' : num === 1 ? 'Étage du haut' : `Étage ${num}`
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 4px' }}>
              <span>{nom}</span>
              <span style={{ color: BORDEAUX, fontWeight: 600 }}>Ø {cm} cm · {persParCm(cm)} pers</span>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 14, color: '#8a7d78' }}>Pour <b style={{ color: BORDEAUX }}>{n}</b> personnes</div>
    </div>
  )
}

function CartePlaque({ titre, larg, prof, n }) {
  return (
    <div style={{ ...CARTE_STYLE, maxWidth: 360, margin: '0 auto' }}>
      <h2 className="font-fraunces" style={{ color: BORDEAUX, fontSize: 20, fontWeight: 600, margin: '0 0 2px' }}>
        {titre}
      </h2>
      <div style={{ fontSize: 13, color: '#8a7d78', marginBottom: 14 }}>1 étage · {n} parts</div>
      <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlaqueSvg larg={larg} prof={prof} />
      </div>
      <div style={{ marginTop: 16, width: '100%', borderTop: '1px dashed #eadfca', paddingTop: 12, fontSize: 13.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 4px' }}>
          <span>Gâteau</span>
          <span style={{ color: BORDEAUX, fontWeight: 600 }}>{larg} × {prof} cm · {n} pers</span>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 14, color: '#8a7d78' }}>Pour <b style={{ color: BORDEAUX }}>{n}</b> personnes</div>
    </div>
  )
}

// Message quand aucun moule ne correspond : on propose les tailles qui existent
function PlaqueImpossible({ titre, n, dispo, onChoisir }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #efe7d7', borderRadius: 20, padding: 40,
      textAlign: 'center', color: '#8a7d78',
    }}>
      Pas de {titre.toLowerCase()} pour {n} personnes.
      <div style={{ marginTop: 16, fontSize: 13 }}>Tailles possibles en {titre.toLowerCase()} :</div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {dispo.map(v => (
          <button key={v} onClick={() => onChoisir(v)} style={{
            border: `1px solid ${CREME2}`, background: '#fff', color: BORDEAUX,
            padding: '6px 14px', borderRadius: 999, fontSize: 14, cursor: 'pointer',
          }}>{v} pers</button>
        ))}
      </div>
    </div>
  )
}

export default function SimulationGateauxView({ user, activeView, onNavigate, onLogout }) {
  const [n, setN] = useState(30)
  const [forme, setForme] = useState('rond')

  const configs = []
  if (forme === 'rond') {
    for (let nb = 1; nb <= 9; nb++) {
      const sizes = computeSizesForCake(n, nb)
      if (sizes) configs.push({ nb, cms: sizes })
    }
  }
  const carre = CARRE_TABLE.find(s => s.pers === n)
  const rect = RECTANGLE_TABLE.find(s => s.pers === n)

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.25rem' }}>
        <h1 className="font-fraunces italic" style={{ fontSize: 26, margin: '0 0 4px', color: '#1a0f0a' }}>🍰 Simulation gâteaux</h1>
        <p style={{ color: '#7a6f66', fontSize: 13, margin: '0 0 18px' }}>
          Montrez au client à quoi ressemble son gâteau selon le nombre d'étages.
          On n'affiche que les configurations réalisables avec les vraies tailles.
        </p>

        {/* Contrôle */}
        <div style={{
          maxWidth: 560, margin: '0 auto 26px', background: '#fff', border: '1px solid #efe7d7',
          borderRadius: 18, padding: '20px 22px', boxShadow: '0 6px 22px rgba(122,31,43,.06)', textAlign: 'center',
        }}>
          <label style={{ display: 'block', fontSize: 14, color: '#8a7d78', marginBottom: 10 }}>Nombre de personnes</label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <input type="number" value={n} min={5} max={1220} step={5}
              onChange={e => setN(parseInt(e.target.value) || 0)}
              style={{
                width: 120, fontSize: 26, textAlign: 'center', padding: '8px 10px',
                border: `2px solid ${CREME2}`, borderRadius: 12, color: BORDEAUX, fontWeight: 600,
              }} />
            <span style={{ fontSize: 15 }}>personnes</span>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[30, 60, 100, 150, 200, 360].map(v => (
              <button key={v} onClick={() => setN(v)} style={{
                border: `1px solid ${CREME2}`, background: '#fff', color: BORDEAUX,
                padding: '6px 14px', borderRadius: 999, fontSize: 14, cursor: 'pointer',
              }}>{v}</button>
            ))}
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[['rond', 'Rond'], ['carre', 'Carré'], ['rect', 'Rectangle']].map(([k, lib]) => (
              <button key={k} onClick={() => setForme(k)} style={{
                border: `1px solid ${forme === k ? BORDEAUX : CREME2}`,
                background: forme === k ? BORDEAUX : '#fff',
                color: forme === k ? '#fff' : BORDEAUX,
                padding: '8px 20px', borderRadius: 999, fontSize: 15, cursor: 'pointer', fontWeight: 600,
              }}>{lib}</button>
            ))}
          </div>
        </div>

        {/* Cartes */}
        {forme === 'carre' ? (
          carre
            ? <CartePlaque titre="Carré" larg={carre.cote} prof={carre.cote} n={n} />
            : <PlaqueImpossible titre="Carré" n={n} dispo={CARRE_TABLE.map(s => s.pers)} onChoisir={setN} />
        ) : forme === 'rect' ? (
          rect
            ? <CartePlaque titre="Rectangle" larg={rect.long} prof={rect.larg} n={n} />
            : <PlaqueImpossible titre="Rectangle" n={n} dispo={RECTANGLE_TABLE.map(s => s.pers)} onChoisir={setN} />
        ) : configs.length === 0 ? (
          <div style={{
            background: '#fff', border: '1px solid #efe7d7', borderRadius: 20, padding: 40,
            textAlign: 'center', color: '#8a7d78',
          }}>
            Aucune configuration possible pour {n} personnes.<br />
            <span style={{ fontSize: 12 }}>(essaie un total réalisable, ex. 30, 60, 100…)</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {configs.map(c => <Carte key={c.nb} nb={c.nb} cms={c.cms} n={n} />)}
          </div>
        )}

        <p style={{ maxWidth: 600, margin: '30px auto 0', textAlign: 'center', fontSize: 13, color: '#8a7d78', lineHeight: 1.5 }}>
          {forme === 'rond'
            ? <>Chaque étage doit être d'une taille différente : plus il y a d'étages, plus il faut de personnes.
              Le rebord orange signale une descente irrégulière (une marche plus grande que les autres).</>
            : <>Le carré et le rectangle se font toujours en <b>un seul étage</b>. Les tailles viennent
              directement des moules utilisés en labo (recette Odoo « CD- Gateau Forme »).</>}
        </p>
      </div>
    </div>
  )
}
