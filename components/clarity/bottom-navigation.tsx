"use client";

import Link from "next/link";
import { BookHeart, CalendarDays, Compass, Home } from "lucide-react";
import { usePathname } from "next/navigation";

export function BottomNavigation({
  contained = false,
  allowNavigation = true,
  hidden = false,
}: {
  contained?: boolean;
  allowNavigation?: boolean;
  hidden?: boolean;
}) {
  const pathname = usePathname();
  const itemClassName =
    "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const items = [
    { href: "/today", label: "Today", icon: Home },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/clarity", label: "Clarity", icon: Compass },
    { href: "/life-model", label: "Life", icon: BookHeart },
  ];

  return (
    <nav
      aria-label="Primary"
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      className={`inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-x-0 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 transition-[opacity,transform] [transition-duration:180ms] ease-out ${
        contained ? "absolute" : "fixed min-[481px]:border-x"
      } ${
        hidden
          ? "pointer-events-none translate-y-2 opacity-0"
          : "translate-y-0 opacity-100"
      }`}
    >
      <div className="grid grid-cols-4 gap-1">
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
              prefetch={false}
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
