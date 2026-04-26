import { supabase } from './supabase'

// Recuperer toutes les couleurs de la palette
export async function loadPalette() {
  const { data, error } = await supabase
    .from('gm_palette')
    .select('*')
    .order('ordre', { ascending: true })

  if (error) throw error
  return data || []
}

// Creer une couleur
export async function createColor({ nom, hex, famille, in_principale = true }) {
  // Trouver le prochain ordre
  const { data: existing } = await supabase
    .from('gm_palette')
    .select('ordre')
    .order('ordre', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].ordre + 1 : 1

  const { data, error } = await supabase
    .from('gm_palette')
    .insert({ nom, hex, famille, ordre: nextOrder, in_principale })
    .select()
    .single()

  if (error) throw error
  return data
}

// Modifier une couleur
export async function updateColor(id, updates) {
  const { data, error } = await supabase
    .from('gm_palette')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Supprimer une couleur
export async function deleteColor(id) {
  const { error } = await supabase
    .from('gm_palette')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

// Familles disponibles
export const FAMILLES = [
  { value: 'rose',       label: 'Rose / Rouge' },
  { value: 'peche',      label: 'Peche / Orange' },
  { value: 'jaune',      label: 'Jaune' },
  { value: 'vert',       label: 'Vert' },
  { value: 'bleu',       label: 'Bleu' },
  { value: 'violet',     label: 'Violet' },
  { value: 'neutre',     label: 'Neutre' },
  { value: 'metallique', label: 'Metallique' },
]
