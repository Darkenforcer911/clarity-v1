"use client";

import type { ComponentProps, ReactNode } from "react";

import { AppShell } from "./app-shell";
import { RecapExperience } from "./recap-experience";

type RecapExperienceProps = ComponentProps<typeof RecapExperience>;

export function RecapScreen({
  experience,
  formAction,
  hiddenFields,
  contained = false,
  developmentPreview = false,
}: {
  experience: RecapExperienceProps;
  formAction?: (formData: FormData) => void | Promise<void>;
  hiddenFields?: ReactNode;
  contained?: boolean;
  developmentPreview?: boolean;
}) {
  const recap = <RecapExperience {...experience} />;

  return (
    <AppShell
      contained={contained}
      enableActivityTracking={!developmentPreview}
      enableTransientNotices={!developmentPreview}
      allowAccountSignOut={!developmentPreview}
      allowProductNavigation={!developmentPreview}
    >
      {formAction ? (
        <form action={formAction}>
          {hiddenFields}
          {recap}
        </form>
      ) : (
        recap
      )}
    </AppShell>
  );
}
