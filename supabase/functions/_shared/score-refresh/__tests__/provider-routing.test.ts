import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyProvider,
  defaultRefreshIntervalSec,
} from "../provider-routing.ts";

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

Deno.test("defaultRefreshIntervalSec: crypto = 15 min", () => {
  assertEquals(defaultRefreshIntervalSec("BTC"), 900);
  assertEquals(defaultRefreshIntervalSec("eth"), 900);
  assertEquals(defaultRefreshIntervalSec("WIF:SOL"), 900);
});

Deno.test("defaultRefreshIntervalSec: stock = 30 min", () => {
  assertEquals(defaultRefreshIntervalSec("AAPL"), 1800);
  assertEquals(defaultRefreshIntervalSec("SPY"), 1800);
  assertEquals(defaultRefreshIntervalSec("NVDA"), 1800);
});
