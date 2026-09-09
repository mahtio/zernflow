"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  GitBranch,
  MessageSquare,
  Users,
  Radio,
  ListOrdered,
  BarChart3,
  Sprout,
  Plug,
  Settings,
  LogOut,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { LanguageSelector } from "@/components/language-selector";
import { useLocale } from "@/components/locale-provider";
import type { Database } from "@/lib/types/database";

type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];

interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  role: string;
}

function subscribeToThemeClass(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const navigation = [
  { key: "flows", href: "/dashboard/flows", icon: GitBranch },
  { key: "inbox", href: "/dashboard/inbox", icon: MessageSquare },
  { key: "contacts", href: "/dashboard/contacts", icon: Users },
  { key: "broadcasts", href: "/dashboard/broadcasts", icon: Radio },
  { key: "sequences", href: "/dashboard/sequences", icon: ListOrdered },
  { key: "analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { key: "growth", href: "/dashboard/growth", icon: Sprout },
  { key: "channels", href: "/dashboard/channels", icon: Plug },
  { key: "settings", href: "/dashboard/settings", icon: Settings },
] as const;

export function Sidebar({
  workspace,
  workspaces,
}: {
  workspace: Workspace;
  user: { id: string; email?: string };
  workspaces: WorkspaceItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { t, locale } = useLocale();
  const [collapsed, setCollapsed] = useState(false);
  const dark = useSyncExternalStore(
    subscribeToThemeClass,
    () => document.documentElement.classList.contains("dark"),
    () => false
  );

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const collapseLabel = locale === "pt-BR" ? "Recolher menu" : "Collapse menu";
  const expandLabel = locale === "pt-BR" ? "Expandir menu" : "Expand menu";

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div
        className={cn(
          "border-b border-sidebar-border p-3",
          collapsed ? "space-y-2" : "flex items-center gap-1"
        )}
      >
        <div className={cn("min-w-0", collapsed ? "w-full" : "flex-1")}>
          <WorkspaceSwitcher current={workspace} workspaces={workspaces} compact={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? expandLabel : collapseLabel}
          title={collapsed ? expandLabel : collapseLabel}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "mx-auto"
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className={cn("flex-1 space-y-1", collapsed ? "p-2" : "p-3")}>
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={t[item.key]}
              title={collapsed ? t[item.key] : undefined}
              className={cn(
                "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-2" : "gap-3 px-3",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{t[item.key]}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={cn("space-y-1 border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
        <div className={cn("py-1", !collapsed && "px-1")}>
          <LanguageSelector direction="up" compact={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? t.lightMode : t.darkMode}
          title={collapsed ? (dark ? t.lightMode : t.darkMode) : undefined}
          className={cn(
            "flex w-full items-center rounded-lg py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          )}
        >
          {dark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {!collapsed && <span>{dark ? t.lightMode : t.darkMode}</span>}
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label={t.signOut}
          title={collapsed ? t.signOut : undefined}
          className={cn(
            "flex w-full items-center rounded-lg py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t.signOut}</span>}
        </button>
      </div>
    </aside>
  );
}
