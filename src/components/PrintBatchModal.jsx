import { useState, useEffect } from 'react'
import PrintCommande from './PrintCommande'
import { markOrdersPrintedBatch } from '../lib/printOrders'
import { loadFichesForOrder } from '../lib/gmFiches'
import { loadPalette } from '../lib/palette'

export default function PrintBatchModal({ orders, user, onClose, onPrinted }) {
  const [printing, setPrinting] = useState(false)
  const [fichesByItemId, setFichesByItemId] = useState({})
  const [palette, setPalette] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const allFiches = {}
        for (const order of orders) {
          const fiches = await loadFichesForOrder(order.id)
          for (const f of fiches) allFiches[f.order_item_id] = f
        }
        setFichesByItemId(allFiches)
        const p = await loadPalette()
        setPalette(p)
      } catch (e) {
        console.error('[batch] erreur chargement:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [orders])

  async function handlePrintAll() {
    if (printing) return
    setPrinting(true)

    // Attendre que le composant <PrintCommande> soit monte ET que les images chargent
    // On laisse 500ms le temps a React de monter + aux <img> de commencer le chargement
    await new Promise(r => setTimeout(r, 500))

    // Lancer impression
    window.print()

    // Marquer toutes les commandes comme imprimees
    try {
      if (user?.id) {
        const ids = orders.map(o => o.id)
        await markOrdersPrintedBatch(ids, user.id)
      }
      if (onPrinted) onPrinted()
    } catch (e) {
      console.error('[batch] erreur marquage:', e)
    }
    setPrinting(false)
    onClose()
  }

  return (
    <>
      {/* MODAL DE CONFIRMATION */}
      {!printing && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
             onClick={onClose}>
          <div className="bg-cream rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl border border-line"
               onClick={e => e.stopPropagation()}>

            <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between z-10">
              <div>
                <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-semibold mb-1">
                  IMPRESSION GROUPEE
                </div>
                <div className="font-fraunces italic text-[20px] font-medium text-ink leading-tight">
                  {orders.length} commande{orders.length > 1 ? 's' : ''} non imprimee{orders.length > 1 ? 's' : ''}
                </div>
              </div>
              <button onClick={onClose}
                      className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0">
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-2">
              <div className="text-[12px] text-ink-mute italic mb-3">
                Triees par date de livraison (la plus proche en premier)
              </div>

              {loading ? (
                <div className="text-center py-6 text-ink-mute text-[12px]">Chargement...</div>
              ) : (
                <div className="space-y-1.5">
                  {orders.map((o, i) => (
                    <div key={o.id} className="flex items-center gap-3 px-3 py-2 bg-white rounded-md border border-line text-[12px]">
                      <span className="font-mono text-[10px] text-ink-mute font-semibold w-6">
                        {i + 1}
                      </span>
                      <span className="font-mono text-[10px] text-bordeaux font-semibold">
                        {o.order_num}
                      </span>
                      <span className="font-fraunces italic text-[13px] text-ink flex-1 truncate">
                        {o.client_name || '—'}
                      </span>
                      <span className="text-[10px] text-ink-mute font-mono">
                        {o.delivery_at ? new Date(o.delivery_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[11px] text-ink-soft italic pt-3">
                ~{orders.length} page{orders.length > 1 ? 's' : ''} (1 commande par page)
              </div>
            </div>

            <div className="sticky bottom-0 bg-cream/95 backdrop-blur-sm border-t border-line px-6 py-3 flex justify-end gap-2">
              <button onClick={onClose}
                      className="px-4 py-2 border border-line text-ink-mute rounded-full text-[11px] font-medium tracking-wider hover:bg-line/30 transition-all">
                Annuler
              </button>
              <button onClick={handlePrintAll} disabled={loading || orders.length === 0}
                      className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all disabled:opacity-50">
                🖨️ Imprimer toutes ({orders.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPOSANT PRINT (cache a l'ecran, visible a l'impression) */}
      {printing && (
        <PrintCommande
          orders={orders}
          fichesByItemId={fichesByItemId}
          palette={palette}
        />
      )}
    </>
  )
}
