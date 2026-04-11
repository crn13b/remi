// Pure env-driven owner check. No DB column, no RLS rule.
export function isOwner(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ownerId = Deno.env.get("OWNER_USER_ID");
  return !!ownerId && userId === ownerId;
}
