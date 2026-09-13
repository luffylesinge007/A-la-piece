/**
 * À LA PIÈCE — Safety & access engine (shared by client and server)
 *
 * Absolute rule: a mission is NEVER accessible to all teens by default.
 * Access depends on age, category, time of day, duration and risk level.
 * Nothing in the app may bypass these rules — not even AI-generated content.
 */

export type AccessLevel = "allowed" | "parental_approval" | "adults_only" | "forbidden";

export const ACCESS_META: Record<
  AccessLevel,
  { label: string; color: string; dot: string; description: string }
> = {
  allowed: {
    label: "Autorisée",
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    dot: "bg-emerald-500",
    description: "Accessible selon ton profil et ton âge.",
  },
  parental_approval: {
    label: "Autorisation nécessaire",
    color: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    dot: "bg-amber-500",
    description: "Un parent ou responsable doit valider cette mission.",
  },
  adults_only: {
    label: "Réservée aux majeurs",
    color: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    dot: "bg-rose-500",
    description: "Réservée aux utilisateurs majeurs.",
  },
  forbidden: {
    label: "Interdite",
    color: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10",
    dot: "bg-zinc-500",
    description: "Non accessible aux mineurs, pour quelque raison que ce soit.",
  },
};

/** Category catalogue (risk-based, extensible via the admin/DB later). `icon` is a pictogram name resolved client-side (src/components/icons.tsx). */
export const CATEGORIES = [
  { slug: "animaux", label: "Animaux", icon: "paw-print", teenFriendly: true, risk: "low", maxMinutesMinor: 120 },
  { slug: "jardinage", label: "Jardinage", icon: "sprout", teenFriendly: true, risk: "low", maxMinutesMinor: 180 },
  { slug: "cours", label: "Soutien scolaire", icon: "book-open", teenFriendly: true, risk: "low", maxMinutesMinor: 120 },
  { slug: "informatique", label: "Informatique", icon: "laptop", teenFriendly: true, risk: "low", maxMinutesMinor: 120 },
  { slug: "courses", label: "Courses & commissions", icon: "shopping-basket", teenFriendly: true, risk: "low", maxMinutesMinor: 90 },
  { slug: "menage", label: "Aide à la maison", icon: "leaf", teenFriendly: true, risk: "low", maxMinutesMinor: 180 },
  { slug: "evenements", label: "Événements", icon: "party-popper", teenFriendly: true, risk: "medium", maxMinutesMinor: 240 },
  { slug: "babysitting", label: "Garde d'enfants", icon: "baby", teenFriendly: false, risk: "high", maxMinutesMinor: 0 },
  { slug: "bricolage", label: "Bricolage", icon: "hammer", teenFriendly: false, risk: "high", maxMinutesMinor: 0 },
  { slug: "livraison", label: "Livraison véhiculée", icon: "bike", teenFriendly: false, risk: "high", maxMinutesMinor: 0 },
] as const;

export type Category = (typeof CATEGORIES)[number];

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function computeAge(birthDate: string | undefined | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export interface MissionSafetyInput {
  categorySlug: string;
  riskLevel: "low" | "medium" | "high";
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  durationMin: number;
}

export interface AccessResult {
  level: AccessLevel;
  reasons: string[];
}

/** Determine whether a mission is accessible to a teen of the given age. */
export function evaluateTeenAccess(mission: MissionSafetyInput, age: number | null): AccessResult {
  const reasons: string[] = [];
  const cat = getCategory(mission.categorySlug);

  // Hard gate: high-risk categories are adults-only, no exceptions.
  if (mission.riskLevel === "high" || (cat && cat.risk === "high")) {
    return { level: "adults_only", reasons: ["Catégorie à risque élevé réservée aux majeurs."] };
  }
  if (cat && !cat.teenFriendly) {
    return { level: "adults_only", reasons: ["Catégorie réservée aux utilisateurs majeurs."] };
  }

  if (age === null) {
    return {
      level: "parental_approval",
      reasons: ["Âge non vérifié — autorisation d'un responsable requise."],
    };
  }
  if (age >= 18) {
    return { level: "allowed", reasons: ["Utilisateur majeur."] };
  }

  // Minors: evaluate category, schedule and duration.
  if (cat && cat.maxMinutesMinor > 0 && mission.durationMin > cat.maxMinutesMinor) {
    reasons.push(`Durée limite pour « ${cat.label} » chez les mineurs : ${cat.maxMinutesMinor} min.`);
  }
  if (mission.riskLevel === "medium") {
    reasons.push("Risque modéré : supervision parentale conseillée.");
  }

  const [y, mo, d] = mission.scheduledDate.split("-").map(Number);
  const [h, mi] = mission.scheduledTime.split(":").map(Number);
  const start = new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  const end = new Date(start.getTime() + mission.durationMin * 60_000);
  const endHour = end.getHours() + end.getMinutes() / 60;

  if (age < 16) {
    if (endHour > 20) {
      reasons.push("Fin après 20h00 : autorisation parentale obligatoire avant 16 ans.");
    }
    return reasons.length > 0
      ? { level: "parental_approval", reasons }
      : { level: "allowed", reasons: ["Mission adaptée à ton âge."] };
  }

  // 16–17 ans
  if (endHour > 22) {
    reasons.push("Fin après 22h00 : autorisation parentale obligatoire.");
  }
  return reasons.length > 0
    ? { level: "parental_approval", reasons }
    : { level: "allowed", reasons: ["Mission adaptée à ton âge."] };
}

/** Access level → can the teen apply right now? */
export function canTeenApply(access: AccessResult, hasParentalApproval: boolean): boolean {
  if (access.level === "allowed") return true;
  if (access.level === "parental_approval") return hasParentalApproval;
  return false;
}

export const PLATFORM_FEE_RATE = 0.1;

export function computeFee(amountEuros: number): number {
  return Math.round(amountEuros * PLATFORM_FEE_RATE * 100) / 100;
}
