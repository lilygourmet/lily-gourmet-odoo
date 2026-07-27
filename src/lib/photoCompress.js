// Réduit une image dans le navigateur (max 1600 px de côté, JPEG qualité 0.82)
// puis renvoie { name, data, mimetype } prêt pour Odoo (data = base64 SANS préfixe).
// But : éviter les requêtes trop lourdes (erreur HTTP 413). Une photo de téléphone
// passe de plusieurs Mo à ~200-400 Ko, qualité largement suffisante pour une référence.
//
// Robustesse : si l'image ne peut PAS être décodée/compressée (format HEIC d'iPhone,
// fichier un peu abîmé…), on n'échoue plus — on envoie le fichier ORIGINAL tel quel,
// pour ne jamais bloquer une commande à cause d'une photo.
export function filePhoto(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('Une photo est illisible. Réessayez ou retirez-la.'))
    r.onload = () => {
      const dataUrl = String(r.result)
      // Repli : le fichier original en base64 (mimetype conservé).
      const original = () => resolve({
        name: file.name || 'photo',
        data: dataUrl.split(',')[1] || '',
        mimetype: file.type || 'application/octet-stream',
      })
      const img = new Image()
      img.onerror = original   // format non décodable (ex. HEIC) → on garde l'original
      img.onload = () => {
        try {
          const MAX = 1600
          let { width, height } = img
          if (width > MAX || height > MAX) {
            const s = MAX / Math.max(width, height)
            width = Math.round(width * s)
            height = Math.round(height * s)
          }
          const cv = document.createElement('canvas')
          cv.width = width
          cv.height = height
          cv.getContext('2d').drawImage(img, 0, 0, width, height)
          const data = cv.toDataURL('image/jpeg', 0.82).split(',')[1] || ''
          if (!data) return original()
          resolve({
            name: `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`,
            data,
            mimetype: 'image/jpeg',
          })
        } catch { original() }
      }
      img.src = dataUrl
    }
    r.readAsDataURL(file)
  })
}
