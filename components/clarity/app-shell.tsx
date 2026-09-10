"use client";

import Link from "next/link";
import { Suspense, useCallback, useState } from "react";

import { AppActivityTracker } from "./app-activity-tracker";
import { AccountMenu } from "./account-menu";
import { BottomNavigation } from "./bottom-navigation";
import { TransientNotice } from "./transient-notice";
import { AppShellEditorProvider } from "./app-shell-editor-context";

export function AppShell({
  children,
  contained = false,
  enableActivityTracking = true,
  enableTransientNotices = true,
  allowAccountSignOut = true,
  allowProductNavigation = true,
  hideBottomNavigation = false,
  showOnboardingPreview = false,
}: {
  children: React.ReactNode;
  contained?: boolean;
  enableActivityTracking?: boolean;
  enableTransientNotices?: boolean;
  allowAccountSignOut?: boolean;
  allowProductNavigation?: boolean;
  hideBottomNavigation?: boolean;
  showOnboardingPreview?: boolean;
}) {
  const [activeEditorIds, setActiveEditorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const registerEditor = useCallback((id: string, active: boolean) => {
    setActiveEditorIds((current) => {
      const next = new Set(current);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const editorNavigationHidden = activeEditorIds.size > 0;
  const brandClassName =
    "flex items-center gap-2 rounded-lg text-lg font-semibold tracking-[-0.03em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const brand = (
    <>
      <span className="size-2.5 rounded-full bg-primary" />
      Clarity
    </>
  );

  return (
    <AppShellEditorProvider register={registerEditor}>
      <div
        className={
          contained
            ? "relative h-full min-h-0 overflow-x-clip bg-background text-foreground"
            : "min-h-svh overflow-x-clip bg-background text-foreground"
        }
      >
        {enableActivityTracking && <AppActivityTracker />}
        {enableTransientNotices && (
          <Suspense>
            <TransientNotice />
          </Suspense>
        )}
        <div
          className={
            contained
              ? "relative mx-auto flex h-full min-h-0 w-full min-w-0 max-w-[480px] flex-col overflow-hidden border-x-0 border-border bg-background"
              : "mx-auto min-h-svh w-full min-w-0 max-w-[480px] overflow-x-clip border-x-0 border-border bg-background min-[481px]:border-x"
          }
        >
          <header
            data-app-shell-header
            className="shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top)]"
          >
            <div className="flex h-14 w-full items-center justify-between px-4">
              {allowProductNavigation ? (
                <Link
                  href="/today"
                  prefetch={false}
                  className={brandClassName}
                >
                  {brand}
                </Link>
              ) : (
                <span className={brandClassName}>{brand}</span>
              )}
              <AccountMenu
                allowSignOut={allowAccountSignOut}
                showOnboardingPreview={showOnboardingPreview}
              />
            </div>
          </header>
          <main
            className={
              contained
                ? `min-h-0 w-full min-w-0 max-w-full flex-1 overflow-y-auto overscroll-contain px-4 pt-5 ${
                    hideBottomNavigation
                      ? "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                      : "pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
                  }`
                : `w-full min-w-0 max-w-full px-4 pt-5 sm:px-5 sm:pt-7 ${
                    hideBottomNavigation
                      ? "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                      : "pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
                  }`
            }
          >
            {children}
          </main>
          {!hideBottomNavigation && (
            <Suspense fallback={null}>
              <BottomNavigation
                contained={contained}
                allowNavigation={allowProductNavigation}
                hidden={editorNavigationHidden}
              />
            </Suspense>
          )}
        </div>
      </div>
    </AppShellEditorProvider>
  );
}
