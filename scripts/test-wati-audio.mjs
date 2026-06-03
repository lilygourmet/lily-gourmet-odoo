// Test ponctuel : envoie un fichier audio via Wati (sendSessionFileViaUrl).
// But : vérifier si WhatsApp affiche bien l'audio côté client.
//
// Usage (dans le terminal, à la racine du projet) :
//   WATI_API_TOKEN="<ton_token>" \
//   WATI_API_ENDPOINT="https://live-mt-server.wati.io/10167479" \
//   node scripts/test-wati-audio.mjs <numero_destinataire> <url_audio_publique>
//
// Le destinataire DOIT t'avoir écrit dans les dernières 24h (règle WhatsApp).
// Conseil : teste 2 URLs pour comparer —
//   - un .mp3 ou .ogg(opus) public  -> devrait s'afficher (formats supportés)
//   - un .webm                      -> devrait être refusé (format non supporté)
// Puis REGARDE le téléphone du destinataire + lis la réponse Wati ci-dessous.

const token = process.env.WATI_API_TOKEN
const endpoint = process.env.WATI_API_ENDPOINT
const number = process.argv[2]
const fileUrl = process.argv[3]

if (!token || !endpoint || !number || !fileUrl) {
  console.error('Manque : WATI_API_TOKEN + WATI_API_ENDPOINT (variables) ET <numero> <url_audio> (arguments)')
  process.exit(1)
}

const auth = token.startsWith('Bearer ') ? token : `Bearer ${token}`
const base = endpoint.replace(/\/$/, '')
const qs = new URLSearchParams({ fileUrl, caption: 'Test audio Lily Gourmet' })
const url = `${base}/api/v1/sendSessionFileViaUrl/${number.replace(/\D/g, '')}?${qs.toString()}`

const res = await fetch(url, { method: 'POST', headers: { Authorization: auth, Accept: 'application/json' } })
console.log('HTTP', res.status)
console.log(await res.text())
