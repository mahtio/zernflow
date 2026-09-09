"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
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
  const { t } = useLocale();
  const dark = useSyncExternalStore(
    subscribeToThemeClass,
    () => document.documentElement.classList.contains("dark"),
    () => false
  );

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

  return (
    <div className="flex h-full w-60 flex-col border-r border-border bg-sidebar">
      <div className="border-b border-sidebar-border px-3 py-3">
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {t[item.key]}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-1">
        <div className="px-1 py-1">
          <LanguageSelector direction="up" />
        </div>
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {dark ? t.lightMode : t.darkMode}
        </button>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {t.signOut}
        </button>
      </div>
    </div>
  );
}
