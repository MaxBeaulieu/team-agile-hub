'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { logout } from '@/lib/auth'

export function SignOutButton() {
  const router = useRouter()

  const handleSignOut = () => {
    logout()
    router.push('/')
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label="Sign out"
    >
      <LogOut className="size-4" />
    </button>
  )
}
