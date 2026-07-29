import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  RotateCcw, Layers, CalendarDays, AlertTriangle,
  BarChart3, Users,
} from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'there'

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold">Good to see you, {displayName} ??</h1>
          <p className="text-xs text-muted-foreground">What would you like to work on today?</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <FeatureCard
            href="/dashboard/retro"
            icon={RotateCcw}
            title="Sprint Retro"
            description="Run your team retrospective with check-in, icebreaker, voting, and discussion phases."
            accent="#6470e0"
          />
          <FeatureCard
            href="/dashboard/poker"
            icon={Layers}
            title="Planning Poker"
            description="Estimate tickets as a team in real time. Import from JIRA and write back estimates."
            accent="#34d399"
          />
          <FeatureCard
            href="/dashboard/planning"
            icon={CalendarDays}
            title="Sprint Planning"
            description="Plan your sprint with capacity, vibe check, training, focus topics, and goals."
            accent="#38bdf8"
          />
          <FeatureCard
            href="/dashboard/blockers"
            icon={AlertTriangle}
            title="Blockers"
            description="Track team blockers across sprints. Surfaces automatically in planning and retros."
            accent="#fbbf24"
          />
          <FeatureCard
            href="/dashboard/health"
            icon={BarChart3}
            title="Sprint Health"
            description="Mood trends, velocity, action item completion, and AI-generated retro themes."
            accent="#f472b6"
          />
          <FeatureCard
            href="/dashboard/teams"
            icon={Users}
            title="Teams"
            description="Manage your teams, invite members, and configure your sprint terminology."
            accent="#a78bfa"
          />
        </div>
      </main>
    </>
  )
}

function FeatureCard({
  href, icon: Icon, title, description, accent,
}: {
  href: string
  icon: React.ElementType
  title: string
  description: string
  accent: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:bg-accent/30 transition-all duration-150"
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${accent}18`, color: accent }}
      >
        <Icon className="size-4" />
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">{title}</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </Link>
  )
}
