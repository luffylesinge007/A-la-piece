export function euros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export function eurosFromNumber(amount: number): string {
  return amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Turn server errors into friendly French messages. */
export function friendlyError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Une erreur est survenue. Réessaie dans quelques instants.";
  // Convex errors often come as "Error: [prefix] message" — clean them up.
  const cleaned = raw.replace(/^Uncaught Error:\s*/i, "").replace(/^Error:\s*/i, "");
  const knownPrefixes = ["FORBIDDEN:", "NOT_FOUND:", "UNAUTHENTICATED:", "NO_PROFILE:", "NO_SETTINGS:", "PAYMENT_NOT_CONFIGURED:", "SÉCURITÉ:"];
  const known = knownPrefixes.find((p) => cleaned.startsWith(p));
  if (known) return cleaned.slice(known.length).trim();
  return cleaned;
}

export const BOOKING_STATUS_META: Record<
  string,
  { label: string; className: string; step: number }
> = {
  pending: { label: "En attente de paiement", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400", step: 1 },
  confirmed: { label: "Confirmée", className: "bg-sky-500/10 text-sky-600 dark:text-sky-400", step: 2 },
  in_progress: { label: "En cours", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400", step: 3 },
  completed: { label: "Terminée", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", step: 4 },
  cancelled: { label: "Annulée", className: "bg-zinc-500/10 text-zinc-500", step: 0 },
  disputed: { label: "Litige", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400", step: 0 },
};

export const PAYMENT_STATUS_META: Record<string, { label: string; className: string }> = {
  requires_payment: { label: "À payer", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  processing: { label: "Paiement en cours", className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  held: { label: "Fonds sécurisés", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  released: { label: "Versé", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  refunded: { label: "Remboursé", className: "bg-zinc-500/10 text-zinc-500" },
  failed: { label: "Échec", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

export const WITHDRAWAL_STATUS_META: Record<string, { label: string; className: string }> = {
  requested: { label: "À valider", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  approved: { label: "En cours", className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  on_hold: { label: "En vérification", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  paid: { label: "Envoyé", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Refusé", className: "bg-zinc-500/10 text-zinc-500" },
  failed: { label: "Échec — remboursé", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

/** Spec #43 §4 — tracking statuses shown on « Mon argent ». */
export const PAYOUT_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  processing: { label: "En cours", className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  requested: { label: "En cours", className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  sent: { label: "Envoyé", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  paid: { label: "Reçu", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  on_hold: { label: "En vérification", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  failed: { label: "Échec", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  refunded: { label: "Remboursé", className: "bg-zinc-500/10 text-zinc-500" },
};

export const APPLICATION_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  accepted: { label: "Acceptée", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  declined: { label: "Non retenue", className: "bg-zinc-500/10 text-zinc-500" },
  withdrawn: { label: "Retirée", className: "bg-zinc-500/10 text-zinc-500" },
};

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
