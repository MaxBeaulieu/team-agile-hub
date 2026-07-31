'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Sparkles, Wifi } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const themes = [
  { id: 'light',    label: 'Light',    icon: Sun },
  { id: 'dark',     label: 'Dark',     icon: Moon },
  { id: 'purple',   label: 'Purple',   icon: Sparkles },
  { id: 'midnight', label: 'Midnight', icon: Wifi },
] as const

interface ThemeSwitcherProps {
  /** Show a minimal icon-only button (default) or a compact pill */
  variant?: 'icon' | 'pill'
  /** Which side of the trigger the menu opens on */
  side?: 'top' | 'bottom'
  /** How the menu aligns against the trigger */
  align?: 'start' | 'end'
  className?: string
}

export function ThemeSwitcher({ variant = 'icon', side = 'bottom', align = 'end', className }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="size-8" />

  const current = themes.find(t => t.id === theme) ?? themes[1]
  const Icon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm',
            'text-muted-foreground hover:text-foreground hover:bg-accent',
            'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            variant === 'pill' && 'border border-border bg-card',
            className
          )}
          aria-label="Switch theme"
        >
          <Icon className="size-4" />
          {variant === 'pill' && <span>{current.label}</span>}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side={side} align={align} className="w-36">
        {themes.map(({ id, label, icon: ThemeIcon }) => (
          <DropdownMenuItem
            key={id}
            onClick={() => setTheme(id)}
            className={cn(
              'flex items-center gap-2 cursor-pointer',
              theme === id && 'text-primary font-medium'
            )}
          >
            <ThemeIcon className="size-4" />
            {label}
            {theme === id && (
              <span className="ml-auto size-1.5 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
