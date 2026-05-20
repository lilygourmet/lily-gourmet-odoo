import { CaisseGenericView } from './MeriemCaisse'

export default function LaylaLG({ user }) {
  return <CaisseGenericView caisseOwner="layla_lg" user={user} accent={{ bg: '#E1F5EE', text: '#085041', border: '#1D9E75' }} />
}
