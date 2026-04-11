import { useContext } from "react";
import { EntitlementsContext } from "../contexts/EntitlementsContext";

export function useEntitlements() {
  const ctx = useContext(EntitlementsContext);
  return ctx;
}
