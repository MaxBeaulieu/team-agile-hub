import { ThemeSwitcher } from '@/components/ui/theme-switcher'

export default function QuickRetroLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <div className="fixed bottom-4 left-4 z-50">
        <ThemeSwitcher variant="pill" side="top" align="start" className="shadow-md" />
      </div>
    </>
  )
}
