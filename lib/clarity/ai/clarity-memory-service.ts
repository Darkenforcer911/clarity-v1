import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  buildClarityMemoryContext,
  type ClarityMemoryReadRow,
} from "./clarity-memory";

const MAX_MEMORY_ROWS_FOR_BOUNDING = 80;

/**
 * Reads only active, owner-scoped ledger rows. Source messages remain in their
 * canonical tables; normal Clarity receives source classes, never transcripts.
 */
export async function loadClarityMemoryContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  now = new Date(),
) {
  const { data, error } = await supabase
    .from("clarity_memory_items")
    .select(
      "id, memory_class, truth_state, topic, statement, confidence, materiality, observed_at, effective_on, review_after, confirmed_at, clarity_memory_item_sources(source_type)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("confirmed_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_MEMORY_ROWS_FOR_BOUNDING);

  if (error) throw new Error(error.message);
  return buildClarityMemoryContext(
    (data ?? []) as ClarityMemoryReadRow[],
    now,
  );
}
