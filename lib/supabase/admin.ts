import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export function createAdminClient(): SupabaseClient<Database> {
  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Notification dispatcher is not configured: ${name}`);
  }
  return value;
}
