"use client";

import { Languages } from "lucide-react";
import { useLocale, type Locale } from "@/components/locale-provider";

export function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Languages className="h-4 w-4" />
      <span className="sr-only">{t.language}</span>
      <select
        aria-label={t.language}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="cursor-pointer bg-transparent text-sm font-medium text-foreground outline-none"
      >
        <option value="en">English</option>
        <option value="pt-BR">Português (Brasil)</option>
      </select>
    </label>
  );
}
