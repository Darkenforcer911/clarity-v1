"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

type PendingButtonProps = ButtonProps & {
  pendingLabel?: string;
};

export function PendingButton({
  children,
  disabled,
  pendingLabel = "Working…",
  ...props
}: PendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
