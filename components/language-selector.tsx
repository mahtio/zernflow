"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useLocale, type Locale } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

interface LanguageOption {
  code: Locale;
  label: string;
  flag: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
];

interface LanguageSelectorProps {
  className?: string;
  direction?: "up" | "down";
  compact?: boolean;
}

export function LanguageSelector({
  className,
  direction = "down",
  compact = false,
}: LanguageSelectorProps) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find((item) => item.code === locale) || LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.language}
        title={compact ? current.label : undefined}
        className={cn(
          "flex w-full items-center rounded-lg border border-border bg-card py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring",
          compact ? "justify-center px-2" : "justify-between gap-2 px-3"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <span className="text-sm leading-none">{current.flag}</span>
          {!compact && <span className="truncate">{current.label}</span>}
        </span>
        {!compact && (
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", {
              "rotate-180": open,
            })}
          />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.language}
          className={cn(
            "absolute z-50 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-xl ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-100",
            compact
              ? "bottom-0 left-full ml-2"
              : direction === "up"
                ? "bottom-full left-0 mb-1.5 w-full"
                : "right-0 top-full mt-1.5 w-full"
          )}
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t.language}
          </div>
          {LANGUAGES.map((item) => {
            const isSelected = item.code === locale;
            return (
              <button
                key={item.code}
                role="option"
                aria-selected={isSelected}
                type="button"
                onClick={() => {
                  setLocale(item.code);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                  isSelected
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm leading-none">{item.flag}</span>
                  <span>{item.label}</span>
                </span>
                {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
