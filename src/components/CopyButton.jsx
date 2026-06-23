import { useState } from 'react'
import { toast } from '../lib/toast'

// Bouton « copier » : copie un texte dans le presse-papier, avec un petit ✓ de confirmation.
export default function CopyButton({ text, className = '' }) {
  const [done, setDone] = useState(false)
  async function copy(e) {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(String(text || ''))
      setDone(true)
      setTimeout(() => setDone(false), 1200)
    } catch {
      toast.error('Copie impossible')
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copier"
      className={`inline-flex items-center justify-center text-[12px] leading-none ${done ? 'text-ok' : 'text-ink-mute hover:text-bordeaux'} transition-colors ${className}`}
    >
      {done ? '✓' : '📋'}
    </button>
  )
}
