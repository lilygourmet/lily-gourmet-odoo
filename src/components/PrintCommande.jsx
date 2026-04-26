import { TYPE_LABELS, TYPE_EMOJIS, getSableDimensionLabel } from '../lib/gmFiches'

// ============================================================
// Composant : impression d'1 ou plusieurs commandes (A4 portrait)
// Calque sur le style PDF Odoo de Lily Gourmet
// Visible UNIQUEMENT a l'impression (CSS @media print dans index.css)
// ============================================================

const DAY_NAMES_FULL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTH_NAMES = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
]

function formatDateFr(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const dayName = DAY_NAMES_FULL[d.getDay()]
  const day = d.getDate()
  const month = MONTH_NAMES[d.getMonth()]
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${dayName} ${day} ${month} ${year} - ${hh}h${mm}`
}

function resolveColors(ids, palette) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  return ids.map(id => {
    if (typeof id === 'object' && id?.hex) return id
    return palette.find(p => p.id === id) || null
  }).filter(Boolean)
}

// ============================================================
// Composant principal
// orders : array de commandes a imprimer (peut etre 1 seule)
// fichesByItemId : map { item_id -> fiche }
// palette : array des couleurs (pour resoudre IDs)
// ============================================================

export default function PrintCommande({ orders, fichesByItemId = {}, palette = [] }) {
  const list = Array.isArray(orders) ? orders : [orders]
  const printedAt = new Date()
  const printedAtStr = `${printedAt.getDate()}/${String(printedAt.getMonth()+1).padStart(2,'0')}/${printedAt.getFullYear()} a ${String(printedAt.getHours()).padStart(2,'0')}h${String(printedAt.getMinutes()).padStart(2,'0')}`

  return (
    <div className="print-area" style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      color: '#1a1a1a',
      background: 'white',
      padding: '0',
    }}>
      {list.map((order, idx) => (
        <PrintSingleOrder
          key={order.id}
          order={order}
          fichesByItemId={fichesByItemId}
          palette={palette}
          pageNumber={idx + 1}
          totalPages={list.length}
          printedAtStr={printedAtStr}
          isLast={idx === list.length - 1}
        />
      ))}
    </div>
  )
}

// ============================================================
// 1 commande sur 1 page A4
// ============================================================

function PrintSingleOrder({ order, fichesByItemId, palette, pageNumber, totalPages, printedAtStr, isLast }) {
  const items = order.order_items || []
  const cdItems = items.filter(i => i.type === 'CD')
  const gmItems = items.filter(i => i.type === 'GM')

  // Allergies / warnings
  const warnings = []
  for (const item of items) {
    const w = item.warnings
    if (!w) continue
    if (typeof w === 'string') warnings.push(w)
    else if (Array.isArray(w)) {
      for (const x of w) {
        if (typeof x === 'string') warnings.push(x)
        else if (x?.text) warnings.push(x.text)
      }
    }
  }

  // Toutes les photos
  const allPhotos = []
  for (const item of items) {
    const urls = Array.isArray(item.image_urls) ? item.image_urls : []
    for (const u of urls) if (!allPhotos.includes(u)) allPhotos.push(u)
  }

  return (
    <div className={isLast ? '' : 'print-page-break'} style={{
      minHeight: '27cm',
      padding: '0',
      pageBreakAfter: isLast ? 'auto' : 'always',
    }}>
      {/* HEADER : logo + Lily Gourmet + nom client a droite */}
      <div className="print-no-break" style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        borderBottom: '0.5px solid #c0c0c0',
        paddingBottom: '12px',
        marginBottom: '20px',
      }}>
        <div>
          <img
            src="/logo.png"
            alt="Lily Gourmet"
            style={{
              width: '60px',
              height: '60px',
              objectFit: 'contain',
              marginBottom: '6px',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <div style={{ fontSize: '11px', color: '#444' }}>Lily Gourmet</div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '2px' }}>
            {order.client_name || '—'}
          </div>
        </div>
      </div>

      {/* TITRE : numero commande */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '28px',
          fontWeight: '300',
          color: '#666',
          marginBottom: '8px',
          letterSpacing: '0.5px',
        }}>
          Bon de production N° {order.order_num}
        </div>
      </div>

      {/* INFOS : 2 colonnes Date / Vendeur */}
      <div className="print-no-break" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '24px',
        fontSize: '12px',
      }}>
        <div>
          <div style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>Date livraison :</div>
          <div style={{ fontWeight: '600' }}>{formatDateFr(order.delivery_at)}</div>
          {order.delivery_slot && (
            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
              Creneau : {order.delivery_slot}
            </div>
          )}
        </div>
        <div>
          <div style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>Vendeur :</div>
          <div style={{ fontWeight: '600' }}>{order.seller_name || '—'}</div>
        </div>
      </div>

      {/* WARNINGS / ALLERGIES */}
      {warnings.length > 0 && (
        <div className="print-no-break" style={{
          border: '1px solid #c2185b',
          background: '#fce4ec',
          padding: '10px 14px',
          marginBottom: '20px',
          borderRadius: '4px',
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: 'bold',
            color: '#c2185b',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '4px',
          }}>
            ⚠️ Avertissement
          </div>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#333' }}>
              {w}
            </div>
          ))}
        </div>
      )}

      {/* SECTION CD */}
      {cdItems.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            paddingBottom: '6px',
            borderBottom: '0.5px solid #ddd',
            marginBottom: '12px',
          }}>
            🎂 GATEAU(X)
          </div>
          {cdItems.map((item, i) => (
            <CdItemPrint key={item.id} item={item} index={i} totalCdItems={cdItems.length} />
          ))}
        </div>
      )}

      {/* SECTION GM */}
      {gmItems.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            paddingBottom: '6px',
            borderBottom: '0.5px solid #ddd',
            marginBottom: '12px',
          }}>
            🧁 ACCESSOIRES
          </div>
          {gmItems.map((item, i) => (
            <GmItemPrint
              key={item.id}
              item={item}
              fiche={fichesByItemId[item.id]}
              palette={palette}
              index={i}
              totalGmItems={gmItems.length}
            />
          ))}
        </div>
      )}

      {/* PHOTOS */}
      {allPhotos.length > 0 && (
        <div className="print-no-break" style={{ marginBottom: '20px', marginTop: '20px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            paddingBottom: '6px',
            borderBottom: '0.5px solid #ddd',
            marginBottom: '12px',
          }}>
            📷 Photos
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
          }}>
            {allPhotos.slice(0, 6).map((url, i) => (
              <div key={i} style={{
                aspectRatio: '1 / 1',
                background: '#f5f5f5',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '0.5px solid #ddd',
              }}>
                <img
                  src={url}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{
        position: 'absolute',
        bottom: '1cm',
        left: '1.5cm',
        right: '1.5cm',
        fontSize: '9px',
        color: '#999',
        textAlign: 'center',
        borderTop: '0.5px solid #eee',
        paddingTop: '6px',
      }}>
        Lily Gourmet · Imprime le {printedAtStr} · Page {pageNumber}/{totalPages}
      </div>
    </div>
  )
}

// ============================================================
// Item CD imprimable
// ============================================================

function CdItemPrint({ item, index, totalCdItems }) {
  const parfumsArray = Array.isArray(item.parfums) ? item.parfums : []
  const polys = item.polys || {}
  const polysList = []
  for (const key of Object.keys(polys)) {
    const v = polys[key]
    const num = parseInt(key.replace('etage', ''), 10)
    polysList.push({ etage: num, value: typeof v === 'object' ? v.value : v })
  }
  polysList.sort((a, b) => a.etage - b.etage)

  return (
    <div className="print-no-break" style={{
      marginBottom: index < totalCdItems - 1 ? '14px' : '0',
      paddingBottom: index < totalCdItems - 1 ? '14px' : '0',
      borderBottom: index < totalCdItems - 1 ? '0.5px dashed #ddd' : 'none',
    }}>
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px' }}>
        × {item.quantity || 1} — {item.title}
      </div>

      <div style={{ fontSize: '12px', color: '#333', lineHeight: '1.6' }}>
        {item.pers && (
          <div>
            {item.pers} personnes
            {item.etages_count && item.etages_count > 1 && ` · ${item.etages_count} etages`}
          </div>
        )}
        {parfumsArray.length > 0 && (
          <div>Parfums : {parfumsArray.join(', ')}</div>
        )}
        {item.theme && <div>Theme : {item.theme}</div>}
        {item.age && <div>Age : {item.age}</div>}
        {item.message && <div>Message : « {item.message} »</div>}
        {polysList.length > 0 && (
          <div>
            Polys :{' '}
            {polysList.map(p => (
              <span key={p.etage}>
                Etage {p.etage} = {p.value || '—'}{' '}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Item GM imprimable (avec fiche patissier si dispo)
// ============================================================

function GmItemPrint({ item, fiche, palette, index, totalGmItems }) {
  const parfumsArray = Array.isArray(item.parfums) ? item.parfums : []
  const qty = item.quantity || 1

  const couleurs = fiche ? resolveColors(fiche.couleurs || [], palette) : []
  const zigzagCouleurs = fiche ? resolveColors(fiche.zigzag_couleurs || [], palette) : []
  const decos = fiche?.decos || []

  // Dispatch parfums
  const dispatchPerParfum = parfumsArray.length > 0 ? Math.floor(qty / parfumsArray.length) : 0

  return (
    <div className="print-no-break" style={{
      marginBottom: index < totalGmItems - 1 ? '12px' : '0',
      paddingBottom: index < totalGmItems - 1 ? '12px' : '0',
      borderBottom: index < totalGmItems - 1 ? '0.5px dashed #ddd' : 'none',
    }}>
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
        × {qty} — {item.title}
        {fiche?.taille && fiche.type_gm !== 'sable' && (
          <span style={{ color: '#666', fontWeight: '400' }}> · {fiche.taille}</span>
        )}
      </div>

      <div style={{ fontSize: '11.5px', color: '#333', lineHeight: '1.6' }}>
        {/* Parfums avec dispatch */}
        {parfumsArray.length > 0 && (
          <div>
            {parfumsArray.length === 1
              ? `${parfumsArray[0]}`
              : parfumsArray.map(p => `${dispatchPerParfum} ${p}`).join(' · ')
            }
          </div>
        )}

        {!fiche && (
          <div style={{ color: '#c2185b', fontStyle: 'italic', marginTop: '4px' }}>
            ⚠ Fiche a definir
          </div>
        )}

        {/* Sables : forme + bord */}
        {fiche?.type_gm === 'sable' && (
          <div>
            Forme {fiche.forme}
            {fiche.taille && ` · ${getSableDimensionLabel(fiche.forme, fiche.taille)}`}
            {fiche.bord && ` · Bord ${fiche.bord}`}
          </div>
        )}

        {/* Couleurs */}
        {couleurs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
            <span>Couleurs :</span>
            {couleurs.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: c.hex,
                  border: '0.5px solid #999',
                }}></span>
                {c.nom}
              </span>
            ))}
          </div>
        )}

        {fiche?.voir_couleur_gateau && (
          <div style={{ fontStyle: 'italic', color: '#666' }}>
            ✦ Voir couleur gateau (idem CD)
          </div>
        )}

        {/* Zigzag */}
        {fiche?.zigzag_mode && fiche.zigzag_mode !== 'pas' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <span>Zigzag :</span>
            {fiche.zigzag_mode === 'meme' && <span>meme couleur</span>}
            {fiche.zigzag_mode === 'differente' && (
              <>
                <span>different :</span>
                {zigzagCouleurs.map((c, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: c.hex,
                      border: '0.5px solid #999',
                    }}></span>
                    {c.nom}
                  </span>
                ))}
              </>
            )}
          </div>
        )}

        {/* Decos */}
        {decos.length > 0 && (
          <div>Deco : {decos.join(' · ')}</div>
        )}
      </div>
    </div>
  )
}
