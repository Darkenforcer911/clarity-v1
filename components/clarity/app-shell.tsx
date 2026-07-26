import Link from "next/link";

import { AppActivityTracker } from "./app-activity-tracker";
import { BottomNavigation } from "./bottom-navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_50%_-10%,#174f9f_0%,#0a2a63_36%,#061737_76%,#040e25_100%)] text-white">
      <AppActivityTracker />
      <header className="border-b border-sky-200/10 bg-[#071a42]/60 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
          <Link
            href="/today"
            className="flex items-center gap-2 text-lg font-semibold tracking-[-0.03em]"
          >
            <span className="size-2.5 rounded-full bg-[#148bff] shadow-[0_0_18px_#38a5ff]" />
            Clarity
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100/50">
            Daily
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-5 sm:pt-8">
        {children}
      </main>
      <BottomNavigation />
    </div>
  );
}
