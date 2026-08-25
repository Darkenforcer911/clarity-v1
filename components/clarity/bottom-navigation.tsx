"use client";

import Link from "next/link";
import { BookHeart, CalendarDays, Home } from "lucide-react";
import { usePathname } from "next/navigation";

export function BottomNavigation({
  contained = false,
  allowNavigation = true,
}: {
  contained?: boolean;
  allowNavigation?: boolean;
}) {
  const pathname = usePathname();
  const itemClassName =
    "flex min-h-12 min-w-24 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const items = [
    { href: "/today", label: "Today", icon: Home },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/life-model", label: "Life", icon: BookHeart },
  ];

  return (
    <nav
      aria-label="Primary"
      className={`inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-x-0 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 ${
        contained ? "absolute" : "fixed min-[481px]:border-x"
      }`}
    >
      <div className="flex justify-center gap-6">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const content = (
            <>
              <item.icon className={`size-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              {item.label}
            </>
          );
          return allowNavigation ? (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`${itemClassName} ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground"}`}
            >
              {content}
            </Link>
          ) : (
            <span key={item.href} className={itemClassName}>{content}</span>
          );
        })}
      </div>
    </nav>
  );
}
