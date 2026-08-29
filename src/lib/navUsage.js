import { supabase } from './supabase'
import { todayISO } from './dates'

// Trace l'ouverture d'un onglet : une seule ligne par personne, par onglet et
// par jour. On garde en mémoire ce qui a déjà été écrit aujourd'hui pour ne pas
// refaire la requête à chaque aller-retour entre deux écrans.
const deja = new Set()

export function tracerOnglet(view, userId) {
  if (!view || !userId) return
  const cle = `${userId}|${view}|${todayISO()}`
  if (deja.has(cle)) return
  deja.add(cle)
  supabase.from('nav_usage')
    .upsert({ user_id: userId, view, jour: todayISO(), vu_a: new Date().toISOString() },
      { onConflict: 'user_id,view,jour' })
    .then(({ error }) => { if (error) deja.delete(cle) })   // on réessaiera
}
