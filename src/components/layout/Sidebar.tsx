import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Wallet, ArrowRightLeft, Settings } from "lucide-react";

export function SidebarContent() {
    const location = useLocation();
    
    const links = [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/wallets", label: "Wallets", icon: Wallet },
        { href: "/transactions", label: "Activity", icon: ArrowRightLeft },
        { href: "/settings", label: "Settings", icon: Settings },
    ];

    return (
        <div className="flex flex-col h-full gap-4 py-4">
          <div className="h-14 flex items-center px-6">
             <h2 className="text-2xl font-bold tracking-tight">OpenSimperfi</h2>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            {links.map((link) => (
                <Link
                    key={link.href}
                    to={link.href}
                    className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                         location.pathname === link.href ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                    )}
                >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                </Link>
            ))}
          </nav>
        </div>
      );
}
