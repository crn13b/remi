import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, serviceKey);

export interface SeededUser {
  email: string;
  password: string;
  plan: string;
  trialOffsetDays?: number;
  isOwner?: boolean;
  /** Distinct tickers to seed as active alerts after profile creation. */
  seedAlertTickers?: string[];
}

export const TEST_USERS: SeededUser[] = [
  { email: "free-fresh@test.remi", password: "TestPass123!", plan: "free" },
  { email: "free-mid@test.remi", password: "TestPass123!", plan: "free", trialOffsetDays: -1 },
  { email: "free-expired@test.remi", password: "TestPass123!", plan: "free", trialOffsetDays: -4 },
  { email: "core@test.remi", password: "TestPass123!", plan: "core" },
  { email: "pro@test.remi", password: "TestPass123!", plan: "pro" },
  { email: "founder@test.remi", password: "TestPass123!", plan: "founder" },
  { email: "owner@test.remi", password: "TestPass123!", plan: "free", isOwner: true },
  // 8th user — dedicated to Task 6.4 paid-to-paid downgrade scenario.
  // Starts as "pro" with 5 distinct-ticker active alerts so the
  // reconcileEntitlements call can soft-disable the excess 2.
  {
    email: "pro-downgrade@test.remi",
    password: "TestPass123!",
    plan: "pro",
    seedAlertTickers: ["BTC", "ETH", "SOL", "ADA", "DOT"],
  },
];

export async function seedAll() {
  for (const u of TEST_USERS) {
    const { data: created } = await supabase.auth.admin.createUser({
      email: u.email, password: u.password, email_confirm: true,
    });
    if (!created?.user) continue;
    const updates: Record<string, unknown> = { plan: u.plan };
    if (u.trialOffsetDays !== undefined) {
      updates.alert_trial_started_at = new Date(Date.now() + u.trialOffsetDays * 86_400_000).toISOString();
    }
    await supabase.from("profiles").update(updates).eq("id", created.user.id);
    if (u.seedAlertTickers) {
      for (const symbol of u.seedAlertTickers) {
        await supabase.from("alerts").insert({
          user_id: created.user.id,
          symbol,
          direction: "long",
          aggressiveness: "default",
          is_active: true,
        });
      }
    }
    if (u.isOwner) console.log(`Set OWNER_USER_ID=${created.user.id} in supabase secrets`);
  }
}

if (import.meta.main) seedAll().then(() => console.log("seed complete"));
