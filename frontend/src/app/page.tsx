import Link from 'next/link'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'

const features = [
  'Sprint Retro',
  'Planning Poker',
  'Sprint Canvas',
  'Blockers',
  'Sprint Health',
]

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-[500px] w-[500px] rounded-full bg-primary/8 blur-[120px]" />
      </div>

      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <span className="text-sm font-semibold tracking-tight leading-tight">Command Center</span>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <Link
            href="/auth/login"
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/login"
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center text-center px-6 py-20">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          Now in preview
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-5 max-w-2xl leading-[1.08]">
          The agile workspace
          <br />
          <span className="text-muted-foreground font-semibold">built for real teams</span>
        </h1>

        <p className="text-base md:text-lg text-muted-foreground max-w-lg mb-10 leading-relaxed">
          Sprint retros, planning poker, and sprint canvas — designed around how
          your team actually works, not how tools think you should.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/auth/login"
            className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Get started free
          </Link>
          <Link
            href="/auth/login"
            className="px-5 py-2.5 rounded-md border border-border bg-card text-sm font-semibold hover:border-primary/50 transition-colors"
          >
            Sign in →
          </Link>
        </div>

        {/* Feature pills */}
        <div className="mt-16 flex flex-wrap justify-center gap-2">
          {features.map((f) => (
            <span
              key={f}
              className="px-3 py-1 rounded-full border border-border bg-card text-xs text-muted-foreground"
            >
              {f}
            </span>
          ))}
        </div>
      </main>
    </div>
  )
}
