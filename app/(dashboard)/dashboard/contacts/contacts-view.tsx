"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Users,
  Mail,
  Calendar,
  CheckCircle,
  XCircle,
  Filter,
  ChevronDown,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SegmentBuilder,
  createEmptyFilter,
  type SegmentFilter,
} from "@/components/segment-builder";
import { useLocale } from "@/components/locale-provider";
import type { Database } from "@/lib/types/database";

type Tag = Database["public"]["Tables"]["tags"]["Row"];
type CustomFieldDefinition =
  Database["public"]["Tables"]["custom_field_definitions"]["Row"];
type ContactWithTags = Database["public"]["Tables"]["contacts"]["Row"] & {
  contact_tags: {
    tag_id: string;
    tags: Tag | null;
  }[];
  contact_custom_fields: {
    field_id: string;
    value: string;
  }[];
};

type FixedColumnId =
  | "name"
  | "email"
  | "lastInteraction"
  | "tags"
  | "subscribed";
type ColumnId = FixedColumnId | `custom:${string}`;

const FIXED_COLUMNS: FixedColumnId[] = [
  "name",
  "email",
  "lastInteraction",
  "tags",
  "subscribed",
];
const COLUMN_STORAGE_KEY = "contacts-visible-columns";

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function isCustomColumn(column: ColumnId): column is `custom:${string}` {
  return column.startsWith("custom:");
}

function formatDate(
  dateStr: string | null,
  locale: string,
  t: ReturnType<typeof useLocale>["t"]
): string {
  if (!dateStr) return t.never;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffDays === 0) return `${t.today}, ${time}`;
  if (diffDays === 1) return `${t.yesterday}, ${time}`;
  if (diffDays < 7) return `${t.daysAgo(diffDays)}, ${time}`;
  const formattedDate = date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
  return `${formattedDate}, ${time}`;
}

export function ContactsView({
  contacts,
  tags,
  customFieldDefinitions,
  workspaceId,
}: {
  contacts: ContactWithTags[];
  tags: Tag[];
  customFieldDefinitions: CustomFieldDefinition[];
  workspaceId: string;
}) {
  const { locale, t } = useLocale();
  const allColumns: ColumnId[] = [
    ...FIXED_COLUMNS,
    ...customFieldDefinitions.map((field) => `custom:${field.id}` as const),
  ];
  const [search, setSearch] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [showSegmentBuilder, setShowSegmentBuilder] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>(
    createEmptyFilter()
  );
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(FIXED_COLUMNS);

  useEffect(() => {
    const savedColumns = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!savedColumns) return;

    try {
      const parsed = JSON.parse(savedColumns) as string[];
      const availableColumns: ColumnId[] = [
        ...FIXED_COLUMNS,
        ...customFieldDefinitions.map(
          (field) => `custom:${field.id}` as const
        ),
      ];
      const validColumns = availableColumns.filter((column) =>
        parsed.includes(column)
      );
      if (validColumns.length > 0) setVisibleColumns(validColumns);
    } catch {
      localStorage.removeItem(COLUMN_STORAGE_KEY);
    }
  }, [customFieldDefinitions]);

  const filtered = contacts.filter((contact) => {
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      const name = contact.display_name?.toLowerCase() ?? "";
      const email = contact.email?.toLowerCase() ?? "";
      if (!name.includes(q) && !email.includes(q)) return false;
    }
    // Tag filter
    if (selectedTagId) {
      const hasTag = contact.contact_tags.some(
        (ct) => ct.tag_id === selectedTagId
      );
      if (!hasTag) return false;
    }
    return true;
  });

  const fixedColumnLabels: Record<FixedColumnId, string> = {
    name: t.tableName,
    email: t.tableEmail,
    lastInteraction: t.lastInteraction,
    tags: t.tags,
    subscribed: t.subscribed,
  };

  function getColumnLabel(column: ColumnId): string {
    if (!isCustomColumn(column)) return fixedColumnLabels[column];
    const fieldId = column.slice("custom:".length);
    return (
      customFieldDefinitions.find((field) => field.id === fieldId)?.name ??
      t.customField
    );
  }

  function getCustomFieldValue(
    contact: ContactWithTags,
    column: ColumnId
  ): string {
    if (!isCustomColumn(column)) return "";
    const fieldId = column.slice("custom:".length);
    return (
      contact.contact_custom_fields.find((field) => field.field_id === fieldId)
        ?.value ?? ""
    );
  }

  function toggleColumn(column: ColumnId) {
    const nextColumns = visibleColumns.includes(column)
      ? visibleColumns.filter((item) => item !== column)
      : allColumns.filter(
          (item) => item === column || visibleColumns.includes(item)
        );

    if (nextColumns.length === 0) return;
    setVisibleColumns(nextColumns);
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(nextColumns));
  }

  function exportCsv() {
    const headers = visibleColumns.map(getColumnLabel);
    const rows = filtered.map((contact) => {
      const contactTags = contact.contact_tags
        .map((contactTag) => contactTag.tags?.name)
        .filter(Boolean)
        .join(", ");
      const fixedValues: Record<FixedColumnId, string> = {
        name: contact.display_name ?? "",
        email: contact.email ?? "",
        lastInteraction: contact.last_interaction_at
          ? new Date(contact.last_interaction_at).toLocaleString(locale)
          : t.never,
        tags: contactTags,
        subscribed: contact.is_subscribed ? t.yes : t.no,
      };
      return visibleColumns.map((column) =>
        isCustomColumn(column)
          ? getCustomFieldValue(contact, column)
          : fixedValues[column]
      );
    });
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.contacts}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.contactsInWorkspace(contacts.length)}
            </p>
          </div>
        </div>

        {/* Search and filters */}
        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t.searchContacts}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => setShowSegmentBuilder(!showSegmentBuilder)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              showSegmentBuilder
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Filter className="h-4 w-4" />
            {t.segment}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showSegmentBuilder && "rotate-180"
              )}
            />
          </button>
          <details className="group relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="h-4 w-4" />
              {t.columns}
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg">
              <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
                {t.visibleColumns}
              </p>
              {allColumns.map((column, index) => (
                <div key={column}>
                  {index === FIXED_COLUMNS.length && (
                    <p className="mt-2 border-t border-border px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">
                      {t.customFields}
                    </p>
                  )}
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column)}
                      onChange={() => toggleColumn(column)}
                      disabled={
                        visibleColumns.length === 1 &&
                        visibleColumns.includes(column)
                      }
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    {getColumnLabel(column)}
                  </label>
                </div>
              ))}
            </div>
          </details>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {t.exportCsv}
          </button>
        </div>

        {/* Segment builder */}
        {showSegmentBuilder && (
          <div className="mt-4">
            <SegmentBuilder
              value={segmentFilter}
              onChange={setSegmentFilter}
              workspaceId={workspaceId}
            />
          </div>
        )}

        {/* Tag pills */}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedTagId(null)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                selectedTagId === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {t.all}
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() =>
                  setSelectedTagId(tag.id === selectedTagId ? null : tag.id)
                }
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  selectedTagId === tag.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
                style={
                  tag.color && selectedTagId !== tag.id
                    ? {
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                      }
                    : undefined
                }
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              {t.noContactsFound}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              {t.contactsEmptyDescription}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                {visibleColumns.map((column, index) => (
                  <th
                    key={column}
                    className={cn(
                      "py-3 text-xs font-medium uppercase text-muted-foreground",
                      index === 0 ? "px-8" : "px-4"
                    )}
                  >
                    {getColumnLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => {
                const contactTags = contact.contact_tags
                  .map((ct) => ct.tags)
                  .filter(Boolean) as Tag[];

                return (
                  <tr
                    key={contact.id}
                    className="border-b border-border transition-colors hover:bg-accent/50"
                  >
                    {visibleColumns.includes("name") && (
                      <td className="px-8 py-3">
                        <Link
                          href={`/dashboard/contacts/${contact.id}`}
                          className="flex items-center gap-3"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {contact.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={contact.avatar_url}
                                alt={contact.display_name || "Contact"}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              contact.display_name?.[0]?.toUpperCase() ?? "?"
                            )}
                          </div>
                          <span className="text-sm font-medium hover:underline">
                            {contact.display_name ?? "Unknown"}
                          </span>
                        </Link>
                      </td>
                    )}
                    {visibleColumns.includes("email") && (
                      <td
                        className={cn(
                          "py-3",
                          visibleColumns[0] === "email" ? "px-8" : "px-4"
                        )}
                      >
                        {contact.email ? (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            {t.noEmail}
                          </span>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes("lastInteraction") && (
                      <td
                        className={cn(
                          "py-3",
                          visibleColumns[0] === "lastInteraction"
                            ? "px-8"
                            : "px-4"
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(contact.last_interaction_at, locale, t)}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes("tags") && (
                      <td
                        className={cn(
                          "py-3",
                          visibleColumns[0] === "tags" ? "px-8" : "px-4"
                        )}
                      >
                        {contactTags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {contactTags.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-medium"
                                style={
                                  tag.color
                                    ? {
                                        backgroundColor: `${tag.color}20`,
                                        borderColor: `${tag.color}40`,
                                        color: tag.color,
                                      }
                                    : undefined
                                }
                              >
                                {tag.name}
                              </span>
                            ))}
                            {contactTags.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{contactTags.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            {t.noTags}
                          </span>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes("subscribed") && (
                      <td
                        className={cn(
                          "py-3",
                          visibleColumns[0] === "subscribed" ? "px-8" : "px-4"
                        )}
                      >
                        {contact.is_subscribed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {t.yes}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <XCircle className="h-3.5 w-3.5" />
                            {t.no}
                          </span>
                        )}
                      </td>
                    )}
                    {visibleColumns
                      .filter((column) => column.startsWith("custom:"))
                      .map((column) => (
                        <td
                          key={column}
                          className={cn(
                            "py-3 text-sm text-muted-foreground",
                            visibleColumns[0] === column ? "px-8" : "px-4"
                          )}
                        >
                          {getCustomFieldValue(contact, column) || "—"}
                        </td>
                      ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
