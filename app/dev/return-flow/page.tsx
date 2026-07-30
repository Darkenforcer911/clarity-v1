import { notFound } from "next/navigation";

import { ReturnFlowPreview } from "@/components/clarity/return-flow-preview";

export default function ReturnFlowPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <ReturnFlowPreview />;
}
