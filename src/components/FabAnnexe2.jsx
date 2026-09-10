// L'aiguillage entre les deux « Fabrication Annexe 2 » : l'ancien écran et
// l'écran simplifié, à l'essai. Le choix vit dans la tablette (localStorage) —
// une tablette peut essayer pendant que les autres gardent l'ancien, et
// revenir tient en un appui, en bas de la liste. (Layla, 2026-09-10.)
import { useState } from 'react'
import { ecranSimple, basculerEcran } from '../lib/ecranSimple'
import FabAnnexe2View from './FabAnnexe2View'
import FabAnnexe2SimpleView from './FabAnnexe2SimpleView'

export default function FabAnnexe2(props) {
  const [simple, setSimple] = useState(ecranSimple)
  const onBasculer = () => setSimple(basculerEcran())
  return simple
    ? <FabAnnexe2SimpleView {...props} onBasculer={onBasculer} />
    : <FabAnnexe2View {...props} onBasculer={onBasculer} />
}
