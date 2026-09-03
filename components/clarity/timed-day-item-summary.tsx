import { ChevronDown, ChevronRight, Clock3 } from "lucide-react";

export function TimedDayItemSummary({
  title,
  meta,
  status,
  disclosure = false,
  expanded = false,
}: {
  title: string;
  meta: string;
  status?: string | null;
  disclosure?: boolean;
  expanded?: boolean;
}) {
  return (
    <>
      <Clock3 className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{meta}</span>
        {status && (
          <span className="mt-1 block text-xs font-medium text-[var(--clarity-completed)]">
            {status}
          </span>
        )}
      </span>
      {disclosure ? (
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
        />
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      )}
    </>
  );
}
