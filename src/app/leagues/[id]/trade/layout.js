import { Barlow_Condensed } from 'next/font/google'

const barlow = Barlow_Condensed({
  weight: ['400', '600', '700', '800', '900'],
  subsets: ['latin'],
  variable: '--font-barlow',
  display: 'swap',
})

export const metadata = { title: 'Trade — Draft Prime' }

export default function TradeLayout({ children }) {
  return (
    <div className={barlow.variable} style={{ minHeight: '100vh' }}>
      {children}
    </div>
  )
}
