import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "./use-auth";

/**
 * Seeds clearly-labelled demo missions when the marketplace is empty,
 * so a fresh environment is never a dead end. Idempotent server-side.
 * Also migrates legacy emoji avatars to pictogram names (one-shot, idempotent).
 */
export function useDemoSeed() {
  const { isAuthenticated } = useAuth();
  const missions = useQuery(api.missions.listMissions, isAuthenticated ? {} : "skip");
  const seed = useMutation(api.seed.seedDemoMissions);
  const migrate = useMutation(api.migrations.migrateLegacyAvatars);
  const tried = useRef(false);
  const migrated = useRef(false);

  useEffect(() => {
    if (missions && missions.length === 0 && !tried.current) {
      tried.current = true;
      seed().catch(() => {
        // Silent: seeding is best-effort demo content.
      });
    }
  }, [missions, seed]);

  useEffect(() => {
    if (isAuthenticated && !migrated.current) {
      migrated.current = true;
      migrate().catch(() => {
        // Silent: migration is best-effort; UI falls back to initials anyway.
      });
    }
  }, [isAuthenticated, migrate]);
}
