"use client";

import Link from "next/link";
import { Download, Home, Share, Smartphone } from "lucide-react";

import { LogoutButton } from "@/components/logout-button";

export function BottomNavigation() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg border-t border-sky-200/15 bg-[#071a42]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
    >
      <div className="grid grid-cols-3 items-end gap-2">
        <Link
          href="/today"
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-white"
        >
          <Home className="size-5 text-[#38a5ff]" />
          Today
        </Link>

        <details className="group relative">
          <summary className="flex min-h-12 cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-blue-100/65 [&::-webkit-details-marker]:hidden">
            <Download className="size-5" />
            Install
          </summary>
          <div className="absolute bottom-16 left-1/2 w-[min(21rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-sky-200/20 bg-[#0a2456] p-4 text-left shadow-2xl">
            <p className="font-semibold text-white">Install Clarity</p>
            <div className="mt-3 space-y-3 text-xs leading-5 text-blue-100/70">
              <p className="flex gap-2">
                <Share className="mt-0.5 size-4 shrink-0 text-[#38a5ff]" />
                <span>
                  <strong className="text-white">iPhone:</strong> open Share in
                  Safari, then choose Add to Home Screen.
                </span>
              </p>
              <p className="flex gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-[#38a5ff]" />
                <span>
                  <strong className="text-white">Android:</strong> open the
                  browser menu, then choose Install app or Add to Home screen.
                </span>
              </p>
            </div>
          </div>
        </details>

        <div className="flex min-h-12 items-center justify-center">
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
