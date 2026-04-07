import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { EffectiveEntitlements, PlanType } from "./types.ts";
import { getEntitlements, TIERS } from "./tiers.ts";
import { isOwner } from "./owner.ts";

export async function getEffectiveEntitlements(
  supabase: SupabaseClient,
  userId: string,
): Promise<EffectiveEntitlements> {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  if (error || !data) {
    // Fail closed: treat unknown users as free, non-owner.
    return {
      plan: "free",
      isOwner: false,
      entitlements: getEntitlements("free"),
    };
  }

  const plan = (data.plan ?? "free") as PlanType;
  const owner = isOwner(userId);

  // Owner override: unlimited everything regardless of plan.
  // We use TIERS.pro as the unlimited template (founder is identical
  // for limits but carries display perks the owner doesn't need).
  const entitlements = owner ? TIERS.pro : getEntitlements(plan);

  return { plan, isOwner: owner, entitlements };
}
