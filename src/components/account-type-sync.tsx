import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

/**
 * One-shot auto-repair: accounts created before `users.accountType` was written
 * at onboarding still have it undefined, which silently breaks every role guard
 * (publish, pay, apply, teen/adult views). Copies the authoritative
 * `profiles.accountType` onto the users row once per session.
 */
export function AccountTypeSync() {
  const { isAuthenticated } = useAuth();
  const sync = useMutation(api.profiles.syncAccountType);
  const done = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || done.current) return;
    done.current = true;
    sync().catch(() => {
      // Silent: it's a repair, not a feature. A failure never blocks the app.
      done.current = false;
    });
  }, [isAuthenticated, sync]);

  return null;
}
