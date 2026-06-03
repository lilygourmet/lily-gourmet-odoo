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
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
})
