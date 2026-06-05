// Blocs de chargement animés (remplacent « Chargement… »).
// Donne une impression de rapidité pendant le chargement des données.
export default function Skeleton({ rows = 4, className = '' }) {
  return (
    <div className={`flex flex-col gap-2.5 p-4 max-w-3xl mx-auto ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-line/40 animate-pulse" />
      ))}
    </div>
  )
}
