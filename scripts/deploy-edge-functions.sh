#!/bin/bash
set -e

ENGINE_SRC=~/remi-engine/src
DEST="$(dirname "$0")/../supabase/functions/_shared/remi-score/engines"

if [ ! -d "$ENGINE_SRC" ]; then
  echo "ERROR: remi-engine not found at $ENGINE_SRC"
  echo "Make sure ~/remi-engine/ exists with the scoring engine source."
  exit 1
fi

mkdir -p "$DEST"

# Copy engine files
cp "$ENGINE_SRC"/divergence/bearish.ts "$DEST"/bearish.ts
cp "$ENGINE_SRC"/divergence/bullish.ts "$DEST"/bullish.ts
cp "$ENGINE_SRC"/shared/rsi.ts "$DEST"/rsi.ts
cp "$ENGINE_SRC"/scoring/combine.ts "$DEST"/combine.ts

# Fix import paths for Deno (flat directory, .ts extensions)
sed -i '' 's|from "../shared/rsi"|from "./rsi.ts"|g' "$DEST"/bearish.ts
sed -i '' 's|from "../shared/rsi"|from "./rsi.ts"|g' "$DEST"/bullish.ts
sed -i '' 's|from "../divergence/bearish"|from "./bearish.ts"|g' "$DEST"/combine.ts
sed -i '' 's|from "../divergence/bullish"|from "./bullish.ts"|g' "$DEST"/combine.ts
sed -i '' 's|from "../shared/rsi"|from "./rsi.ts"|g' "$DEST"/combine.ts
sed -i '' 's|from "../types"|from "./types.ts"|g' "$DEST"/combine.ts

# Copy types file too
cp "$ENGINE_SRC"/types.ts "$DEST"/types.ts

echo "Engine files copied to $DEST"
echo "Now run: npx supabase functions deploy"
