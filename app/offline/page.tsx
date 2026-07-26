import Link from "next/link";
import { CloudOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#071b45] px-6 text-white">
      <section className="w-full max-w-sm rounded-3xl border border-sky-200/20 bg-[#0b285f] p-6 text-center shadow-2xl">
        <CloudOff className="mx-auto size-9 text-[#38a5ff]" />
        <h1 className="mt-5 text-2xl font-semibold">Clarity is offline</h1>
        <p className="mt-3 text-sm leading-6 text-blue-100/70">
          Reconnect to load your latest plan and safely update your day.
        </p>
        <Link
          href="/today"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#148bff] font-semibold text-white"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
