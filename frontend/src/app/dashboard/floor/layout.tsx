import type { ReactNode } from 'react'
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--fp-font-sans',
})

const plexCondensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fp-font-cond',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--fp-font-mono',
})

/** `display: contents` so the font variables inherit without adding a box that
 *  would break the dashboard's flex column. */
export default function FloorLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${plexSans.variable} ${plexCondensed.variable} ${plexMono.variable}`}
      style={{ display: 'contents' }}
    >
      {children}
    </div>
  )
}
