// Réduit une image dans le navigateur (max 1600 px de côté, JPEG qualité 0.82)
// puis renvoie { name, data, mimetype } prêt pour Odoo (data = base64 SANS préfixe).
// But : éviter les requêtes trop lourdes (erreur HTTP 413). Une photo de téléphone
// passe de plusieurs Mo à ~200-400 Ko, qualité largement suffisante pour une référence.
export function filePhoto(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = reject
    r.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
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
        const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '')
        resolve({
          name: `${baseName}.jpg`,
          data: cv.toDataURL('image/jpeg', 0.82).split(',')[1] || '',
          mimetype: 'image/jpeg',
        })
      }
      img.src = String(r.result)
    }
    r.readAsDataURL(file)
  })
}
