"use client";

import { ChevronDown, Languages } from "lucide-react";
import { useLocale, type Locale } from "@/components/locale-provider";

export function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();

  return (
    <label className="group flex w-full cursor-pointer items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent focus-within:ring-2 focus-within:ring-ring">
      <Languages className="h-4 w-4 shrink-0 text-primary" />
      <span className="sr-only">{t.language}</span>
      <select
        aria-label={t.language}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-sm font-medium text-sidebar-foreground outline-none"
      >
        <option value="pt-BR">Português (Brasil)</option>
        <option value="en">English</option>
      </select>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-focus-within:rotate-180" />
    </label>
  );
}
