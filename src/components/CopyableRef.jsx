import { useState } from 'react'

// Numéro de commande cliquable : un clic copie le n° (sans bouton/logo séparé), petit ✓ bref.
// stopPropagation → cliquer le n° dans une carte ne déclenche PAS l'ouverture de la commande.
export default function CopyableRef({ value, className = '' }) {
  const [done, setDone] = useState(false)
  async function copy(e) {
    e.stopPropagation()
    e.preventDefault()
    if (!value) return
    try {
      await navigator.clipboard.writeText(String(value))
      setDone(true)
      setTimeout(() => setDone(false), 1000)
    } catch { /* ignore */ }
  }
  return (
    <span
      onClick={copy}
      role="button"
      title="Cliquer pour copier le n°"
      className={`cursor-pointer inline-flex items-center rounded-md px-2 py-1 -mx-1 transition-colors ${done ? 'text-ok bg-ok/10' : 'hover:bg-bordeaux/10'} ${className}`}
    >
      {value}{done ? ' ✓' : ''}
    </span>
  )
}
