import "server-only";

import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import { loadClarityMemoryContext } from "./ai/clarity-memory-service";
import { parseLifeModel, type LifeModel } from "./life-model";
import { buildLifeProjection } from "./life-projection";

/**
 * Returns confirmed canonical Life Model data only. Calendar and Today history
 * stay in their authoritative stores; this read includes only their stable
 * Life Model relationships.
 */
export async function getLifeModel(): Promise<LifeModel> {
  const { supabase } = await getAuthenticatedUserAndProfile();
  return loadCanonicalLifeModel(supabase);
}

export async function getLifePageModel() {
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const [life, memory] = await Promise.all([
    loadCanonicalLifeModel(supabase),
    loadClarityMemoryContext(supabase, user.id),
  ]);

  return {
    life,
    projection: buildLifeProjection({
      profile: {
        name: profile.name,
        city: profile.city,
        country: profile.country,
      },
      life,
      memory,
    }),
  };
}

async function loadCanonicalLifeModel(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserAndProfile>>["supabase"],
) {
  const { data, error } = await supabase.rpc("get_life_model");

  if (error) {
    throw new Error(error.message);
  }

  return parseLifeModel(data);
}
