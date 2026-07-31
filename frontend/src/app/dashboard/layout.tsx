import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Users, AlertTriangle,
  BarChart3, Settings, CalendarDays, CalendarRange, MessageSquare, Spade, CheckSquare, LayoutGrid, Coffee, Map,
} from 'lucide-react'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'
import { SignOutButton } from '@/components/ui/sign-out-button'
import { AuthProvider, NoTeamOnly, RetroAccessOnly, TeamAdminOnly, TeamMemberOnly } from '@/components/providers/auth-provider'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <AuthProvider>
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-border bg-card shrink-0">
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center px-4 border-b border-border">
          <Link href="/dashboard" className="text-xs font-semibold tracking-tight hover:text-primary transition-colors leading-tight">
            Command Center
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 p-2 overflow-y-auto">
          {/* Always available: the dashboard, the page you join a team from, and the
              floor map — which belongs to no team. Everything else is team-scoped and
              would just show an empty team picker, so it stays hidden until you join one. */}
          <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem href="/dashboard/teams" icon={Users} label="Teams" />
          <NavItem href="/dashboard/floor" icon={Map} label="Floor Map" />

          <TeamMemberOnly>
            <NavItem href="/dashboard/workload" icon={LayoutGrid} label="Workload" />
            <NavItem href="/dashboard/standup" icon={Coffee} label="Standup" />
            <NavItem href="/dashboard/sprints" icon={CalendarDays} label="Sprints" />
            <NavItem href="/dashboard/planning/list" icon={CalendarRange} label="Sprint Planning" />
          </TeamMemberOnly>

          {/* Retro is the exception: invite-link guests and personal quick retros exist
              outside any team, so anyone with retro history keeps the entry point. */}
          <RetroAccessOnly>
            <NavItem href="/dashboard/retro/list" icon={MessageSquare} label="Retro" />
          </RetroAccessOnly>

          <TeamMemberOnly>
            <NavItem href="/dashboard/poker/list" icon={Spade} label="Planning Poker" />
            <NavItem href="/dashboard/blockers" icon={AlertTriangle} label="Blockers" />
            <NavItem href="/dashboard/action-items" icon={CheckSquare} label="Action Items" />
            <NavItem href="/dashboard/health" icon={BarChart3} label="Sprint Health" />
          </TeamMemberOnly>

          <NoTeamOnly>
            <p className="mt-2 rounded-md bg-accent/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Sprints, standups and the rest live inside a team.{' '}
              <Link href="/dashboard/teams" className="font-medium text-foreground hover:text-primary">
                Join or create one
              </Link>{' '}
              to unlock them.
            </p>
          </NoTeamOnly>
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-2 space-y-0.5">
          {/* Jira integration is team-admin only, so hide the whole page from members. */}
          <TeamAdminOnly>
            <NavItem href="/dashboard/settings" icon={Settings} label="Settings" />
          </TeamAdminOnly>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="max-w-[120px] truncate text-xs text-muted-foreground">
              {user.email}
            </span>
            <div className="flex items-center gap-1">
              <ThemeSwitcher />
              <SignOutButton />
            </div>
          </div>
        </div>
      </aside>

      {/* Page content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
    </AuthProvider>
  )
}

function NavItem({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ElementType
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  )
}
