// Script de test : génère la feuille de congé (FR + AR) avec des données d'exemple.
// Simule window/document pour capturer le HTML, l'écrit dans test-feuille-conge.html.
import { writeFileSync } from 'fs'

let captured = ''
globalThis.window = {
  open: () => ({
    document: {
      write: (html) => { captured = html },
      close: () => {},
    },
  }),
}

const { imprimerFeuilleConge } = await import('./src/lib/feuilleConge.js')

const conge = {
  type_conge: 'annuel',
  date_debut: '2026-06-15',
  date_fin: '2026-06-20',
}
const emp = {
  nom: 'Mohamed Test',
  cnss: '123456789',
  poste: 'Cuisinier',
  jour_repos: 'dimanche',
}
const solde = 18
const joursFeries = [{ date: '2026-06-17', nom: 'عيد الأضحى' }]
const recupAllocs = []
const recupDejaConsomme = 0

imprimerFeuilleConge({ conge, emp, solde, joursFeries, recupAllocs, recupDejaConsomme })

// Remplace le logo absolu par rien (pas de serveur), pour aperçu local
captured = captured.replace('src="/Logo_LG.jpg"', 'src=""')

writeFileSync('test-feuille-conge.html', captured)
console.log('OK -> test-feuille-conge.html (' + captured.length + ' octets)')
