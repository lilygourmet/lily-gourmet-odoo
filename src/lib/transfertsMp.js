import { supabase } from './supabase'

// Matières premières transférables (annexe → boutique). Tout en kg.
export const MATIERES = [
  'Œuf blanc', 'Œuf jaune', 'Œuf entier',
  'Crème whipping', 'Beurre entremet', 'Mascarpone', 'Amandes brut',
]

export async function loadTransferts() {
  const { data, error } = await supabase
    .from('transferts_mp').select('*')
    .order('transfer_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Annexe : enregistre un envoi (en attente de confirmation boutique).
export async function addTransfert({ matiere, qty, date, user }) {
  const { error } = await supabase.from('transferts_mp').insert({
    matiere,
    qty_envoye: Number(qty),
    transfer_date: date,
    envoye_par: user?.full_name || null,
    envoye_par_id: user?.id || null,
  })
  if (error) throw error
}

// Boutique : confirme la réception (quantité reçue, corrigée si écart).
export async function confirmTransfert(id, qtyRecu, user) {
  const { error } = await supabase.from('transferts_mp').update({
    statut: 'recu',
    qty_recu: Number(qtyRecu),
    recu_par: user?.full_name || null,
    recu_par_id: user?.id || null,
    confirmed_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}
