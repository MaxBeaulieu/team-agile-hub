import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Users, AlertTriangle,
  BarChart3, Settings, CalendarDays, CalendarRange, Layers, MessageSquare, Spade, CheckSquare, LayoutGrid, Coffee, Map,
} from 'lucide-react'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'
import { SignOutButton } from '@/components/ui/sign-out-button'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-border bg-card shrink-0">
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center px-4 border-b border-border">
          <Link href="/dashboard" className="text-xs font-semibold tracking-tight hover:text-primary transition-colors leading-tight">
            PR Patrol<br />Command Center
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 p-2 overflow-y-auto">
          <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem href="/dashboard/teams" icon={Users} label="Teams" />
          <NavItem href="/dashboard/workload" icon={LayoutGrid} label="Workload" />
          <NavItem href="/dashboard/floor" icon={Map} label="Floor Map" />
          <NavItem href="/dashboard/standup" icon={Coffee} label="Standup" />
          <NavItem href="/dashboard/sprints" icon={CalendarDays} label="Sprints" />
          <NavItem href="/dashboard/planning/list" icon={CalendarRange} label="Sprint Planning" />
          <NavItem href="/dashboard/retro/list" icon={MessageSquare} label="Retro" />
          <NavItem href="/dashboard/poker/list" icon={Spade} label="Planning Poker" />
          <NavItem href="/dashboard/epics" icon={Layers} label="Epics" />
          <NavItem href="/dashboard/blockers" icon={AlertTriangle} label="Blockers" />
          <NavItem href="/dashboard/action-items" icon={CheckSquare} label="Action Items" />
          <NavItem href="/dashboard/health" icon={BarChart3} label="Sprint Health" />
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-2 space-y-0.5">
          <NavItem href="/dashboard/settings" icon={Settings} label="Settings" />
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
