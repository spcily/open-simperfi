import { SidebarContent } from './Sidebar'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Menu, User } from 'lucide-react'
import { Outlet } from "react-router-dom"
import { ThemeToggle } from '@/components/theme-toggle'

export default function Layout() {
  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* DESKTOP SIDEBAR - Hidden on mobile, fixed width on desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card fixed inset-y-0 z-50">
        <SidebarContent />
      </aside>

      {/* MAIN CONTENT AREA - Pushed right on desktop */}
      <div className="flex-1 flex flex-col md:pl-64 transition-all duration-300">
        {/* TOP BAR */}
        <header className="h-16 border-b flex items-center px-4 bg-background sticky top-0 z-40 gap-4">
          
          {/* Mobile Helper: Sheet Trigger */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"><Menu className="h-5 w-5"/></Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>

          <div className="font-semibold text-lg">Dashboard</div> 
          
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="rounded-full">
                <User className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
