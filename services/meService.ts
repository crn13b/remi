import { supabase } from "./supabaseClient";
import { invoke } from "./_invoke";
import type { EffectiveEntitlements } from "../types/entitlements";
import { rehydrateEntitlements } from "../types/entitlements";
import type { Aggressiveness, NudgeFrequency } from "../components/alerts/types";

export async function updateNotificationPrefs(input: {
  email_enabled?: boolean;
  discord_enabled?: boolean;
  telegram_enabled?: boolean;
  nudge_enabled?: boolean;
  nudge_frequency?: NudgeFrequency;
  nudge_time?: string;
  global_aggressiveness?: Aggressiveness;
}) {
  return invoke("update-notification-prefs", input);
}

export async function fetchMe(): Promise<EffectiveEntitlements> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("not authenticated");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`/me failed: ${res.status}`);
  const json = await res.json();
  return {
    plan: json.plan,
    isOwner: json.isOwner,
    entitlements: rehydrateEntitlements(json.entitlements),
    dailyScoreLookupsRemaining:
      typeof json.dailyScoreLookupsRemaining === "number"
        ? json.dailyScoreLookupsRemaining
        : null,
  };
}
