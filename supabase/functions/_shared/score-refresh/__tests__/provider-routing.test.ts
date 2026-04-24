import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyProvider } from "../provider-routing.ts";

Deno.test("classifies known crypto symbols as crypto", () => {
  assertEquals(classifyProvider("BTC"), "crypto");
  assertEquals(classifyProvider("ETH"), "crypto");
  assertEquals(classifyProvider("sol"), "crypto");
  assertEquals(classifyProvider("PEPE"), "crypto");
});

Deno.test("classifies DEX-style tokens (contain ':') as crypto", () => {
  assertEquals(classifyProvider("WIF:SOL"), "crypto");
  assertEquals(classifyProvider("solana:0xabc"), "crypto");
});

Deno.test("classifies unknown symbols (stocks) as stock", () => {
  assertEquals(classifyProvider("AAPL"), "stock");
  assertEquals(classifyProvider("SPY"), "stock");
  assertEquals(classifyProvider("NVDA"), "stock");
});
