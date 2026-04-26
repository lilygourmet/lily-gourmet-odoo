// ============================================================
// Helper : conversion personnes -> tailles en cm pour les CD
// Utilise par OrderModal et l'impression PDF
// ============================================================

const SIZE_TABLE = [
  { cm: 15, pers: 5 },
  { cm: 20, pers: 10 },
  { cm: 25, pers: 15 },
  { cm: 30, pers: 20 },
  { cm: 35, pers: 30 },
  { cm: 40, pers: 40 },
  { cm: 45, pers: 60 },
  { cm: 50, pers: 80 },
  { cm: 55, pers: 100 },
  { cm: 60, pers: 130 },
  { cm: 65, pers: 130 },
  { cm: 70, pers: 200 },
  { cm: 75, pers: 200 },
  { cm: 80, pers: 200 },
]

export function computeSizesForCake(pers, etages) {
  if (!pers || !etages) return null
  const e = Math.max(1, etages)

  if (e === 1) {
    const match = SIZE_TABLE.find(s => s.pers === pers)
    return match ? [match.cm] : null
  }

  const allSolutions = []

  function search(startIdx, remainingEtages, currentSum, currentPath) {
    if (remainingEtages === 0) {
      if (currentSum === pers) {
        allSolutions.push([...currentPath])
      }
      return
    }
    const maxStart = SIZE_TABLE.length - remainingEtages
    for (let i = startIdx; i <= maxStart; i++) {
      const newSum = currentSum + SIZE_TABLE[i].pers
      if (newSum > pers) break
      search(i + 1, remainingEtages - 1, newSum, [...currentPath, SIZE_TABLE[i].cm])
    }
  }

  search(0, e, 0, [])

  if (allSolutions.length === 0) return null

  allSolutions.sort((a, b) => {
    const rangeA = a[a.length - 1] - a[0]
    const rangeB = b[b.length - 1] - b[0]
    if (rangeA !== rangeB) return rangeA - rangeB
    return b[b.length - 1] - a[a.length - 1]
  })

  return allSolutions[0]
}
