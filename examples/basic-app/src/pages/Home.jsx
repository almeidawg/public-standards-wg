import { COMPANY, PLANS, URLS } from '../data/config'

export function Home() {
  return (
    <main>
      <a href={URLS.site}>Website</a>
      <p>{COMPANY.phone}</p>
      <p>{COMPANY.email}</p>
      <p>{PLANS[0].price}</p>
    </main>
  )
}
