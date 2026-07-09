import { Barlow_Condensed } from 'next/font/google'

const barlow = Barlow_Condensed({
  weight: ['400', '600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-barlow',
  display: 'swap',
})

export const metadata = {
  title: 'Profile — Draft Prime',
}

export default function ProfileLayout({ children }) {
  return (
    <div className={barlow.variable} style={{ minHeight: '100vh' }}>
      {children}
    </div>
  )
}
