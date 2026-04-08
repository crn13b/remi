import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { EffectiveEntitlements } from "../types/entitlements";
import { fetchMe } from "../services/meService";
import { supabase } from "../services/supabaseClient";

interface ContextValue {
  data: EffectiveEntitlements | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const EntitlementsContext = createContext<ContextValue>({
  data: null,
  loading: true,
  refresh: async () => {},
});

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<EffectiveEntitlements | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const eff = await fetchMe();
      setData(eff);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) refresh();
      else setData(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo<ContextValue>(
    () => ({ data, loading, refresh }),
    [data, loading, refresh],
  );

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}
