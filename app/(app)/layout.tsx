import { AppShell } from "@/components/clarity/app-shell";

export default function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
