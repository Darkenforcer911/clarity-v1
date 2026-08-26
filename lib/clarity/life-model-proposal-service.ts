import "server-only";

import { z } from "zod";

import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";

const proposalSchema = z.object({
  id: z.string().uuid(),
  proposal_source: z.literal("mentor"),
  status: z.enum(["pending", "accepted", "rejected", "superseded"]),
  user_facing_summary: z.string(),
  proposed_changes: z.object({
    operations: z.array(z.record(z.string(), z.unknown())).min(1),
  }),
  created_at: z.string(),
});

export type LifeModelChangeProposal = z.infer<typeof proposalSchema>;

export async function getLifeModelChangeProposal(
  proposalId: string,
): Promise<LifeModelChangeProposal> {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase
    .from("life_model_change_proposals")
    .select(
      "id, proposal_source, status, user_facing_summary, proposed_changes, created_at",
    )
    .eq("id", proposalId)
    .eq("proposal_source", "mentor")
    .single();

  if (error) throw new Error(error.message);
  return proposalSchema.parse(data);
}
