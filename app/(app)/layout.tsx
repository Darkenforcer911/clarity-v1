import { AppShell } from "@/components/clarity/app-shell";
import { onboardingPreviewEnabled } from "@/lib/clarity/onboarding-preview";

export default function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell showOnboardingPreview={onboardingPreviewEnabled}>
      {children}
    </AppShell>
  );
}
