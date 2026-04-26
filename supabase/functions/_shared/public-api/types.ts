// supabase/functions/_shared/public-api/types.ts
// Public API response shape. Pinned independently of the UI's RemiScoreResult
// so future changes to the UI endpoint don't ripple into the public contract.

export interface PublicScoreResult {
  symbol: string;
  score: number;
  sentiment: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | "High Probability Setup";
  price: string;
  price_raw: number;
  change: string;
  change_raw: number;
  name: string;
  computed_at: string; // ISO 8601 UTC
}

export type PublicErrorCode =
  | "not_tracked"
  | "invalid_symbol";

export interface PublicSymbolError {
  code: PublicErrorCode;
  message: string;
}

export interface PublicScoreResponse {
  results: Record<string, PublicScoreResult>;
  errors: Record<string, PublicSymbolError>;
}
