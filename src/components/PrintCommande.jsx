import { TYPE_LABELS, TYPE_EMOJIS, getSableDimensionLabel } from '../lib/gmFiches'
import { computeSizesForCake } from '../lib/cakeSizes'


function cleanParfums(parfumsArray) {
  if (!Array.isArray(parfumsArray)) return []
  const FORMES = ['carre', 'rectangle', 'rond', 'rectangle', 'ovale', 'coeur', 'fleur', 'etoile']
  return parfumsArray.filter(p => {
    if (!p) return false
    const lower = String(p).toLowerCase().trim()
    // Filtrer les nombres seuls
    if (/^\d+$/.test(lower)) return false
    // Filtrer les formes
    if (FORMES.includes(lower)) return false
    return true
  })
}

// Extrait les notes/warnings (line_note Odoo) d'un item sous forme d'array de strings
function extractItemWarnings(item) {
  const w = item?.warnings
  if (!w) return []
  if (typeof w === 'string') return w.trim() ? [w.trim()] : []
  if (Array.isArray(w)) {
    return w
      .map(x => typeof x === 'string' ? x : (x?.text || ''))
      .map(s => String(s).trim())
      .filter(Boolean)
  }
  if (typeof w === 'object' && w.text) {
    const t = String(w.text).trim()
    return t ? [t] : []
  }
  return []
}

// Bloc rose pale "Note" affiche sous un article (s'il a des notes)
function ItemNote({ item }) {
  const notes = extractItemWarnings(item)
  if (notes.length === 0) return null
  return (
    <div style={{
      marginTop: '6px',
      padding: '6px 10px',
      background: '#fce4ec',
      borderLeft: '3px solid #c2185b',
      borderRadius: '3px',
    }}>
      <div style={{
        fontSize: '9.5px',
        fontWeight: 'bold',
        color: '#c2185b',
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        marginBottom: '2px',
      }}>
        ⚠ Note
      </div>
      {notes.map((n, i) => (
        <div key={i} style={{
          fontSize: '11.5px',
          color: '#333',
          fontStyle: 'italic',
          lineHeight: '1.4',
        }}>
          {n}
        </div>
      ))}
    </div>
  )
}

// Section "Entremets & sucré" / "Salé" : liste simple nom + quantité + commentaire ⚠️
function ExtraSection({ title, emoji, items }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase',
        letterSpacing: '1.5px', paddingBottom: '6px', borderBottom: '0.5px solid #ddd', marginBottom: '12px',
      }}>
        {emoji} {title}
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ marginBottom: i < items.length - 1 ? '8px' : '0' }}>
          <div style={{ fontSize: '13px', color: '#1a0f0a' }}>
            <span style={{ fontWeight: 'bold' }}>{Number(it.qty) > 1 ? `${it.qty}× ` : ''}</span>{it.name}
          </div>
          {it.note && <ItemNote item={{ warnings: it.note }} />}
        </div>
      ))}
    </div>
  )
}

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
  // Filtre les items a quantite zero (acompte, lignes ajoutees pour reference, etc.)
  // On accepte les strings et les nombres pour la quantite.
  const rawItems = order.order_items || []
  const items = rawItems.filter(i => {
    const q = parseFloat(i?.quantity)
    return !isNaN(q) && q > 0
  })
  const cdItems = items.filter(i => i.type === 'CD')
  const gmItems = items.filter(i => i.type === 'GM')
  // Entremets/sucré + salés : viennent de sales_lines (hors cake design), avec leur commentaire.
  const extraItems = order.extra_items || []
  const sucreItems = extraItems.filter(i => ['PROD', 'RAHN', 'VIENN'].includes(i.category))
  const saleItems = extraItems.filter(i => i.category === 'SALES')

  // Toutes les photos
  const allPhotos = []
  for (const item of items) {
    const urls = Array.isArray(item.image_urls) ? item.image_urls : []
    for (const u of urls) if (!allPhotos.includes(u)) allPhotos.push(u)
  }
  // Repli : photos du chatter Odoo (passées par order.fallback_photos) si aucune photo synchronisée.
  if (allPhotos.length === 0 && Array.isArray(order.fallback_photos)) {
    for (const u of order.fallback_photos) if (u && !allPhotos.includes(u)) allPhotos.push(u)
  }

  return (
    <div className="print-order-page" style={{
      padding: '0',
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
          <div style={{ fontWeight: '600' }}>{order.app_seller || order.seller_name || '—'}</div>
        </div>
      </div>

      {/* Note / commentaire de la commande (ex. « ⚠️ … chocolat blanc… ») */}
      {order.order_note && (
        <div style={{ margin: '0 0 16px', padding: '8px 12px', background: '#fce4ec', borderLeft: '3px solid #c2185b', borderRadius: '3px' }}>
          <div style={{ fontSize: '9.5px', fontWeight: 'bold', color: '#c2185b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '3px' }}>💬 Commentaire</div>
          <div style={{ fontSize: '12px', color: '#333', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{order.order_note}</div>
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

      {/* SECTION ENTREMETS & SUCRÉ + SALÉ (depuis sales_lines, avec commentaire) */}
      <ExtraSection title="Entremets & sucré" emoji="🍰" items={sucreItems} />
      <ExtraSection title="Salé" emoji="🥪" items={saleItems} />

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

      {/* FOOTER : en flux normal, 1 par commande */}
      <div style={{
        marginTop: '24px',
        paddingTop: '6px',
        borderTop: '0.5px solid #eee',
        fontSize: '9px',
        color: '#999',
        textAlign: 'center',
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
  const parfumsArray = cleanParfums(item.parfums)
  const polys = item.polys || {}
  const polysList = []
  for (const key of Object.keys(polys)) {
    const v = polys[key]
    const num = parseInt(key.replace('etage', ''), 10)
    polysList.push({ etage: num, value: typeof v === 'object' ? v.value : v })
  }
  polysList.sort((a, b) => a.etage - b.etage)

  // Calculer les tailles en cm
  const etagesCount = item.etages_count || 1
  const sizesPerEtage = item.pers ? computeSizesForCake(item.pers, etagesCount) : null

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

        {/* Tailles par etage avec parfum */}
        {sizesPerEtage && (
          <div style={{ marginTop: '4px', padding: '6px 10px', background: '#fff8e7', borderRadius: '4px', border: '0.5px solid #f0e0a0' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#7a5c00', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '3px' }}>
              Tailles
            </div>
            {sizesPerEtage.map((cm, i) => (
              <div key={i} style={{ fontSize: '12px', color: '#333' }}>
                <span style={{ fontWeight: '600', color: '#7a5c00' }}>{cm} cm</span>
                {parfumsArray[i] && <span style={{ fontStyle: 'italic', color: '#666' }}> · {parfumsArray[i]}</span>}
              </div>
            ))}
          </div>
        )}

        {!sizesPerEtage && parfumsArray.length > 0 && (
          <div>Parfums : {parfumsArray.join(', ')}</div>
        )}
        {item.theme && <div>Theme : {item.theme}</div>}
        {item.age && <div>Age : {item.age}</div>}
        {item.message && <div>Message : « {item.message} »</div>}
        {item.modele && <div style={{ fontWeight: 'bold' }}>📷 Modèle : {item.modele}</div>}
        {item.modelage && <div style={{ fontWeight: 'bold' }}>🖐️ Modelage : {item.modelage}</div>}
        {item.impression && <div style={{ fontWeight: 'bold' }}>🖨️ Impression : {item.impression}</div>}
        {item.decor && !item.modelage && !item.impression && <div>🎨 Décor : {item.decor}</div>}
        {item.fleurs && <div style={{ fontWeight: 'bold' }}>🌸 Fleurs : {item.fleurs}</div>}
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
      <ItemNote item={item} />
    </div>
  )
}

// ============================================================
// Item GM imprimable (avec fiche patissier si dispo)
// ============================================================

function GmItemPrint({ item, fiche, palette, index, totalGmItems }) {
  const parfumsArray = cleanParfums(item.parfums)
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
        × {qty} {item.title}
      </div>

      <div style={{ fontSize: '11.5px', color: '#333', lineHeight: '1.6' }}>
        {/* Taille */}
        {fiche?.taille && fiche.type_gm !== 'sable' && (
          <div>Taille : {fiche.taille}</div>
        )}
        {/* Parfums avec dispatch */}
        {parfumsArray.length > 0 && (
          <div>
            Parfums : {parfumsArray.length === 1
              ? parfumsArray[0]
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
        {/* Thème / Âge / Message (comme les cake design) — ex. « chocolat blanc, hajj mubarak… » */}
        {item.theme && <div>Theme : {item.theme}</div>}
        {item.age && <div>Age : {item.age}</div>}
        {item.message && <div>Message : « {item.message} »</div>}
      </div>
      <ItemNote item={item} />
    </div>
  )
}
