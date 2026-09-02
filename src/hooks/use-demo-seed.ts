import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "./use-auth";

/**
 * Seeds clearly-labelled demo missions when the marketplace is empty,
 * so a fresh environment is never a dead end. Idempotent server-side.
 */
export function useDemoSeed() {
  const { isAuthenticated } = useAuth();
  const missions = useQuery(api.missions.listMissions, isAuthenticated ? {} : "skip");
  const seed = useMutation(api.seed.seedDemoMissions);
  const tried = useRef(false);

  useEffect(() => {
    if (missions && missions.length === 0 && !tried.current) {
      tried.current = true;
      seed().catch(() => {
        // Silent: seeding is best-effort demo content.
      });
    }
  }, [missions, seed]);
}
