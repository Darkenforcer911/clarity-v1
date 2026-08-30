"use client";

import { Download, Eye, LogOut, MoreHorizontal, Share, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { deactivateCurrentDevicePushSubscription } from "@/lib/clarity/push-subscription-client";
import { NotificationControl } from "./notification-control";

export function AccountMenu({
  allowSignOut = true,
  showOnboardingPreview = false,
}: {
  allowSignOut?: boolean;
  showOnboardingPreview?: boolean;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await deactivateCurrentDevicePushSubscription();
    } catch {
      // Sign-out must still proceed if this browser cannot unsubscribe cleanly.
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-xl"
          aria-label="Open account menu"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border-border bg-card p-2 text-foreground"
      >
        <DropdownMenuLabel className="flex items-center gap-2 px-3 pt-2">
          <Download className="size-4 text-primary" />
          Install Clarity
        </DropdownMenuLabel>
        <div className="space-y-3 px-3 pb-3 pt-2 text-xs leading-5 text-muted-foreground">
          <p className="flex gap-2">
            <Share className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">iPhone:</strong> open Share
              in Safari, then choose Add to Home Screen.
            </span>
          </p>
          <p className="flex gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Android:</strong> open the
              browser menu, then choose Install app or Add to Home screen.
            </span>
          </p>
        </div>
        <DropdownMenuSeparator className="bg-border" />
        <NotificationControl />
        {showOnboardingPreview && (
          <>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem asChild className="min-h-11 cursor-pointer rounded-xl px-3 text-foreground focus:bg-secondary focus:text-foreground">
              <Link href="/dev/onboarding">
                <Eye />
                Preview onboarding
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          disabled={signingOut || !allowSignOut}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          className="min-h-11 cursor-pointer rounded-xl px-3 text-foreground focus:bg-secondary focus:text-foreground data-[disabled]:bg-secondary data-[disabled]:text-muted-foreground data-[disabled]:opacity-100"
        >
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
