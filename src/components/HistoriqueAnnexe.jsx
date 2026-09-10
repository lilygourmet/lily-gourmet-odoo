// L'historique des déclarations de l'annexe, rangé PAR DATE — une fenêtre
// qu'on ouvre depuis un bouton. « L'historique c'est un bouton. Par date. »
// (Layla, 2026-09-09.)
//
// L'atelier voit d'un coup d'œil ce qui est déjà passé, et personne ne refait
// ce qu'un collègue vient de faire.
import { parJour } from '../lib/fabAnnexe'
import { qte, propre } from '../lib/ecranSimple'
import { todayISO } from '../lib/dates'

const jourLong = j =>
  new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

const heure = t => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

export default function HistoriqueAnnexe({ histo, onFermer }) {
  const jours = parJour(histo)
  return (
    <div className="fixed inset-0 z-[70] bg-ink/40 flex items-start justify-center p-3 pt-10"
      onPointerDown={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-cream rounded-2xl w-full max-w-[560px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0 border-b border-cream-deep">
          <b className="text-[16px]">🕓 Ce qui a été déclaré</b>
          <button onClick={onFermer}
            className="ml-auto bg-cream-warm rounded-lg px-3 py-1.5 text-[12.5px]">fermer</button>
        </div>
        <div className="px-4 py-3 flex-1 overflow-y-auto overscroll-contain">
          {!jours.length && (
            <p className="text-center text-[13px] text-ink-mute py-10">Rien ces 7 derniers jours.</p>
          )}
          {jours.map(([jour, lignes]) => (
            <div key={jour} className="mb-4">
              <div className="text-[12.5px] font-bold text-bordeaux mb-1.5 pb-1 border-b border-cream-deep">
                {jour === todayISO() ? "Aujourd'hui" : jourLong(jour)}
                <span className="font-normal text-ink-mute"> · {lignes.length}</span>
              </div>
              {lignes.map(l => (
                <div key={l.id} className="flex items-baseline gap-2.5 py-1.5 border-b border-cream-deep/40 last:border-0">
                  <span className="text-[11px] text-ink-mute font-mono shrink-0">{heure(l.fait_le)}</span>
                  <span className="flex-1 min-w-0 text-[12.5px] leading-tight">
                    {propre(l.article)}
                    {/* Pour quel gâteau elle a été faite : elle lui est réservée. */}
                    {l.pour && <span className="text-ink-mute"> · pour {propre(l.pour)}</span>}
                  </span>
                  <span className="text-[12px] font-extrabold whitespace-nowrap">{qte(l.qty, l.unite)}</span>
                  {l.qui && <span className="text-[11px] text-ink-mute whitespace-nowrap">{l.qui.split(' ')[0]}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
