import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const fullProfile = useQuery(
    api.profiles.myProfile,
    isAuthenticated ? {} : "skip",
  );
  const { signIn, signOut } = useAuthActions();

  const isLoading = isAuthLoading || user === undefined || (isAuthenticated && fullProfile === undefined);

  return {
    isLoading,
    isAuthenticated,
    user,
    profile: fullProfile?.profile ?? null,
    settings: fullProfile?.settings ?? null,
    isMinor: fullProfile?.isMinor ?? false,
    age: fullProfile?.age ?? null,
    hasApprovedParent: fullProfile?.hasApprovedParent ?? false,
    needsOnboarding: isAuthenticated && !isAuthLoading && user != null && !user.onboarded,
    signIn,
    signOut,
  };
}
