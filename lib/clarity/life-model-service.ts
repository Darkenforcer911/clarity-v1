import "server-only";

import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import { parseLifeModel, type LifeModel } from "./life-model";

/**
 * Returns confirmed canonical Life Model data only. Calendar and Today history
 * stay in their authoritative stores; this read includes only their stable
 * Life Model relationships.
 */
export async function getLifeModel(): Promise<LifeModel> {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc("get_life_model");

  if (error) {
    throw new Error(error.message);
  }

  return parseLifeModel(data);
}
