import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

export default function Calendar({ user, onLogout }) {
  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>🚧 Lily Gourmet Odoo - En construction</h1>
      <p>Connecté: {user?.username || "???"}</p>
      <p>Le composant Calendar sera reconstruit avec sync Odoo dans les prochaines sessions.</p>
      <button onClick={onLogout} style={{ padding: 10, marginTop: 20 }}>Déconnexion</button>
    </div>
  )
}
