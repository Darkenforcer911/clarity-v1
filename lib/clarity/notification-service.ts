import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import type { NormalizedPushSubscription } from "./push-subscription";

type RpcClient = SupabaseClient<Database>;

export async function registerPushSubscription(
  subscription: NormalizedPushSubscription & { userAgent: string | null },
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  await callNotificationRpc(supabase, "register_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh_key: subscription.p256dhKey,
    p_auth_key: subscription.authKey,
    p_expiration_time: subscription.expirationTime,
    p_user_agent: subscription.userAgent,
  });
}

export async function disablePushSubscription(endpoint: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  await callNotificationRpc(supabase, "disable_push_subscription", {
    p_endpoint: endpoint,
  });
}

export async function isPushSubscriptionEnabled(endpoint: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const data = await callNotificationRpc(
    supabase,
    "is_push_subscription_enabled",
    { p_endpoint: endpoint },
  );
  return data === true;
}

async function callNotificationRpc(
  supabase: RpcClient,
  name: string,
  args: Record<string, unknown>,
) {
  const rpc = supabase.rpc as unknown as (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc.call(supabase, name, args);
  if (error) throw new Error(error.message);
  return data;
}
