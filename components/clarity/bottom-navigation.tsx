import Link from "next/link";
import { Home } from "lucide-react";

export function BottomNavigation({
  contained = false,
  allowNavigation = true,
}: {
  contained?: boolean;
  allowNavigation?: boolean;
}) {
  const itemClassName =
    "flex min-h-12 min-w-24 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const itemContent = (
    <>
      <Home className="size-5 text-primary" />
      Today
    </>
  );

  return (
    <nav
      aria-label="Primary"
      className={`inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-x-0 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 ${
        contained ? "absolute" : "fixed min-[481px]:border-x"
      }`}
    >
      <div className="flex justify-center">
        {allowNavigation ? (
          <Link
            href="/today"
            aria-current="page"
            className={itemClassName}
          >
            {itemContent}
          </Link>
        ) : (
          <span aria-current="page" className={itemClassName}>
            {itemContent}
          </span>
        )}
      </div>
    </nav>
  );
}
