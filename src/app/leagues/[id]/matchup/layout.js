import { Barlow_Condensed } from 'next/font/google'

const barlow = Barlow_Condensed({
  weight: ['400', '600', '700', '800', '900'],
  subsets: ['latin'],
  variable: '--font-barlow',
  display: 'swap',
})

export const metadata = { title: 'Matchup — Draft Prime' }

export default function MatchupLayout({ children }) {
  return (
    <div className={barlow.variable} style={{ minHeight: '100vh' }}>
      {children}
    </div>
  )
}
