/**
 * À LA PIÈCE — payout anti-fraud rules (spec #43 §6).
 *
 * Pure functions only: no DB access, so the rules stay unit-testable and are
 * shared by mutations (wallet.ts) and by tests. The DB-backed signals (recent
 * account change, past failures) are passed in as plain arguments.
 */

export interface PayoutRiskInput {
  /** Amount requested, in cents. */
  amountCents: number;
  /** ISO country of the destination bank account, when known. */
  accountCountry?: string | null;
  /** When the payout account was last changed (undefined = never changed). */
  bankAccountChangedAt?: number | null;
  /** Consecutive failed payout attempts for this account (0 = none). */
  recentFailedPayouts: number;
}

export interface PayoutRiskResult {
  /** true ⇒ the payout is parked on hold pending manual verification. */
  hold: boolean;
  reasons: string[];
  /** 0–100, higher = riskier. Purely informational. */
  score: number;
}

const CENTS_THRESHOLD = 300_00; // €300

/** French IBAN country codes. Anything else needs extra checks. */
const SUPPORTED_COUNTRIES = ["FR", "MC", "BE", "DE", "ES", "IT", "LU", "NL", "PT", "IE", "AT"];

/**
 * Decide whether a withdrawal must be parked (spec: never block money
 * permanently — a hold is always reviewable by moderation, and refused
 * payouts always refund the teen's available balance).
 */
export function evaluatePayoutRisk(input: PayoutRiskInput): PayoutRiskResult {
  const reasons: string[] = [];
  let score = 0;

  // 1. Large first payout — verify once, then never again (spec §6).
  if (input.amountCents >= CENTS_THRESHOLD) {
    score += 50;
    reasons.push("Montant élevé (≥ 300 €) — vérification supplémentaire requise");
  }

  // 2. Very recent bank account change — classic account-takeover pattern.
  if (input.bankAccountChangedAt && Date.now() - input.bankAccountChangedAt < 24 * 3_600_000) {
    score += 50;
    reasons.push("Compte bancaire modifié il y a moins de 24 h — délai de sécurité");
  }

  // 3. Destination outside the supported zone (identity check needed).
  if (input.accountCountry && !SUPPORTED_COUNTRIES.includes(input.accountCountry.toUpperCase())) {
    score += 35;
    reasons.push("Compte bancaire hors zone SEPA de référence — vérification requise");
  }

  // 4. Repeated failures — likely wrong details or a compromised account.
  if (input.recentFailedPayouts >= 2) {
    score += 55;
    reasons.push(`${input.recentFailedPayouts} échecs de virement récents sur ce compte`);
  } else if (input.recentFailedPayouts === 1) {
    score += 20;
    reasons.push("Un échec de virement récent sur ce compte");
  }

  return { hold: score >= 50, reasons, score: Math.min(100, score) };
}
