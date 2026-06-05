// Fenêtre de confirmation jolie, appelable de partout (async) :
//   if (await confirmDialog('Supprimer X ?', { danger: true })) { ... }
// Repli automatique sur window.confirm si l'hôte n'est pas monté (sécurité).
let opener = null

export function registerConfirm(fn) { opener = fn }

export function confirmDialog(message, opts = {}) {
  if (!opener) return Promise.resolve(window.confirm(message))
  return new Promise(resolve => opener({ message: String(message ?? ''), ...opts }, resolve))
}
