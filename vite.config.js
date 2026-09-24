import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Numero unique de build (l'heure du build). Sert a detecter qu'un nouveau
// deploiement a eu lieu pour proposer la mise a jour aux utilisateurs.
const BUILD_ID = String(Date.now())

// Petit plugin : ecrit /version.json dans le build avec le numero ci-dessus.
function emitVersion() {
  return {
    name: 'emit-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ id: BUILD_ID }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), emitVersion()],
  // Deux pages : l'app interne, et l'annuaire public (page à part, avec son
  // propre manifeste pour que le raccourci du téléphone rouvre l'annuaire).
  build: {
    // ⚠️ POUR QUEL NAVIGATEUR ON COMPILE. Par défaut Vite vise Safari 14, et
    // laisse donc passer des écritures modernes (`a &&= b`, `a ||= b`,
    // `a ??= b` : 295 fois dans le build). Un Safari plus ancien ne sait pas
    // les LIRE : il refuse le fichier entier avec « Importing a module script
    // failed » — le même message que pour un fichier manquant, d'où la
    // confusion. Chrome, lui, se met à jour tout seul et n'a jamais le
    // problème (Layla, 2026-09-24 : « toujours sur Safari, pas sur Chrome »).
    // es2019 fait convertir ces écritures ; c'est de la SYNTAXE seulement,
    // aucun comportement ne change.
    target: 'es2019',
    rollupOptions: {
      input: { main: './index.html', annuaire: './annuaire.html' },
    },
  },
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
})
