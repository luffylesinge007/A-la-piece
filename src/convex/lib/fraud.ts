import type { Id } from "../_generated/dataModel";

/**
 * À LA PIÈCE — anti-fraud & content-security engine.
 *
 * Two roles:
 *  1. `scanMission` — detects scam patterns in published offers (too-good pay,
 *     payment-to-work, off-platform recruitment, external links…). High-risk
 *     offers are automatically held for human moderation.
 *  2. `classifyMessage` — detects dangerous content in chat (bank details,
 *     passwords, verification codes, phishing links, money requests…).
 *
 * Pure functions — no DB access — so they stay unit-testable.
 */

// ---------------------------------------------------------------------------
// 1. Mission anti-scam scan
// ---------------------------------------------------------------------------

export interface MissionScanInput {
  title: string;
  description: string;
  priceEuros: number;
  durationMin: number;
}

export interface MissionScanResult {
  /** 0–100. >= 60 ⇒ held for moderation, never visible to teens. */
  score: number;
  reasons: string[];
  blocked: boolean;
}

const URL_RE = /(https?:\/\/|www\.)[^\s<>"']+/i;
const DOMAIN_RE = /\b[a-z0-9-]+\.(?:com|net|org|fr|io|xyz|top|click|link|ru|cn|info|biz)\b(?![^.\s]*\.)/i;

export function scanMission(m: MissionScanInput): MissionScanResult {
  const reasons: string[] = [];
  let score = 0;
  const text = `${m.title}\n${m.description}`;
  const lower = text.toLowerCase();

  // --- unrealistic pay -----------------------------------------------------
  // Local micro-missions realistically pay 3–50 €/h; far above that with a
  // short duration is the classic "too good to be true" scam pattern.
  const hourly = m.priceEuros / (m.durationMin / 60);
  if (hourly > 120) {
    score += 60;
    reasons.push(`Rémunération irréaliste (${Math.round(hourly)} €/h) — signature d'arnaque connue`);
  } else if (hourly > 60) {
    score += 20;
    reasons.push("Rémunération très au-dessus du marché pour ce type de mission");
  }

  // --- pay-to-work patterns (hard scam signal) ------------------------------
  if (/\b(?:frais|paiement|payer|avance|caution|dep[oô]t|achat)\b[^.?!]{0,40}\b(?:dossier|inscription|mat[eé]riel|uniforme|formation|kit|licence)\b/i.test(text) ||
      /\b(?:frais|paiement|payer|avance|caution)\b[^.?!]{0,30}\d+\s*[€$]/i.test(text)) {
    score += 60;
    reasons.push("Demande de paiement pour accéder au travail — arnaque type « emploi payant »");
  }

  // --- early bank details (hard scam signal) -------------------------------
  if (/\b(?:iban|rib|bic|swift)\b/i.test(text) ||
      /\bfr\d{2}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}/i.test(text)) {
    score += 60;
    reasons.push("Coordonnées bancaires demandées dans l'annonce");
  }

  // --- off-platform recruitment / external contact -------------------------
  if (URL_RE.test(text)) {
    score += 35;
    reasons.push("Lien externe dans l'annonce — contourne la messagerie sécurisée");
  } else if (DOMAIN_RE.test(text)) {
    score += 30;
    reasons.push("Nom de domaine externe mentionné");
  }
  if (/\b(?:whats?app|telegram|snap(?:chat)?|insta(?:gram)?|discord)\b/i.test(lower)) {
    score += 60;
    reasons.push("Invitation à continuer sur une messagerie externe non supervisée");
  }

  // --- contact harvesting --------------------------------------------------
  if (/\b(?:0[67])\d[ .-]?\d{2}[ .-]?\d{2}[ .-]?\d{2}[ .-]?\d{2}\b/.test(text)) {
    score += 20;
    reasons.push("Numéro de téléphone publié dans l'annonce");
  }
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) {
    score += 20;
    reasons.push("Adresse email publiée dans l'annonce");
  }

  // --- crypto / fake employer ---------------------------------------------
  if (/\b(?:bitcoin|crypto|usdt|trading|forex|investis?se?ment|rendement)\b/i.test(lower)) {
    score += 35;
    reasons.push("Sujet financier à risque (crypto/trading) — fréquent dans les arnaques");
  }
  if (/\b(?:recrut(?:e|ement)|embauche)\b[^.?!]{0,30}\b(?:sans\s+entretien|imm[ée]diat|1000\s*[€/]\s*jour|gros\s+salaire)\b/i.test(lower)) {
    score += 25;
    reasons.push("Promesse d'embauche irréaliste sans entretien");
  }

  // --- copied/duplicated spam ---------------------------------------------
  if (new Set(lower.split(/\s+/)).size < Math.min(6, lower.split(/\s+/).length) && lower.length > 80) {
    score += 15;
    reasons.push("Contenu très répétitif — spam probable");
  }

  // --- text hygiene --------------------------------------------------------
  if (/(.)\1{15,}/.test(text)) {
    score += 25;
    reasons.push("Caractères répétés anormaux — spam");
  }

  const blocked = score >= 60;
  return { score: Math.min(100, score), reasons, blocked };
}

// ---------------------------------------------------------------------------
// 2. Chat message classification
// ---------------------------------------------------------------------------

export type MessageFlag =
  | "bank_details"
  | "money_request"
  | "password_or_code"
  | "external_link"
  | "phone_number"
  | "email_address"
  | "home_address"
  | "private_photos"
  | "off_platform_payment"
  | "gross_or_sexual"
  | "harassment";

export interface MessageClassification {
  flags: MessageFlag[];
  /** User-facing warning, in French, or null when clean. */
  warning: string | null;
  /** true ⇒ the message is refused outright (never stored). */
  blocked: boolean;
}

const FLAG_WARNINGS: Record<MessageFlag, string> = {
  bank_details:
    "Coordonnées bancaires détectées — ne communique jamais d'IBAN/RIB. Les paiements passent uniquement par le paiement sécurisé À LA PIÈCE.",
  money_request:
    "Demande d'argent détectée — refuse tout paiement direct. L'argent ne circule que via l'application.",
  password_or_code:
    "Mot de passe ou code détecté — personne ne doit jamais te demander un mot de passe ou un code de vérification.",
  external_link:
    "Lien externe — risque de phishing. Vérifie l'adresse avant de cliquer : en cas de doute, ne clique pas.",
  phone_number:
    "Numéro de téléphone détecté — garder le contact dans l'app te protège (et tes paiements).",
  email_address:
    "Adresse email détectée — garder le contact dans l'app te protège.",
  home_address:
    "Adresse personnelle détectée — l'adresse exacte d'une mission n'est visible qu'après confirmation.",
  private_photos:
    "Demande de photos privées — signale immédiatement ce comportement via le bouton Signaler.",
  off_platform_payment:
    "Paiement hors application détecté — payer en dehors de l'app te fait perdre toutes tes protections (litige, remboursement).",
  gross_or_sexual:
    "Contenu inapproprié détecté — ce type de message est signalé automatiquement à la modération.",
  harassment:
    "Ton semble agressif — les insultes et le harcèlement entraînent une suspension du compte.",
};

const HARD_BLOCK_FLAGS: MessageFlag[] = ["gross_or_sexual", "private_photos"];

export function classifyMessage(body: string): MessageClassification {
  const flags: MessageFlag[] = [];
  const t = body;

  if (/\b(?:iban|rib|bic|swift)\b/i.test(t) || /\bfr\d{2}[ ]?\d{4}[ ]?\d{4}/i.test(t) ||
      /\b\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}\b/.test(t) ||
      /\b(?:carte|cb)\b[^.?!]{0,15}\b\d{4}(?:[ ]?\d{4}){2,3}\b/i.test(t)) {
    flags.push("bank_details");
  }

  if (/\b(?:envoie|donne|verse|paie|payer|envoyer|virer|virement|paypal|lydia|revolut|wise|cash)\b[^.?!]{0,30}\b(?:argent|€|euros?|50|20|10|somme|montant)\b/i.test(t) ||
      /\bargent\b[^.?!]{0,20}\b(?:avant|maintenant|directement|d'avance)\b/i.test(t) ||
      (/\b(?:iban|rib)\b/i.test(t) && /\b(?:pay(?:er|é)|avance|en\s+avance)\b/i.test(t))) {
    flags.push("money_request");
    flags.push("off_platform_payment");
  }

  // Paying outside the app: cash in hand or off-platform wallets.
  if (/\b(?:paie|paiement|payer|payé|r[èe]gle|r[èe]gler)\b[^.?!]{0,15}\b(?:en\s+)?(?:cash|esp[eè]ces|liquide)\b/i.test(t) ||
      /\b(?:paypal|lydia|revolut|wise|apple\s*pay|google\s*pay)\b/i.test(t)) {
    flags.push("off_platform_payment");
  }

  if (/\b(?:mot\s+de\s+passe|password|mdp|code\s+(?:de\s+)?(?:v[eé]rification|s[eé]curit[eé]|confirmation|otp)|pin\s*:?)\b/i.test(t) ||
      /\b\d{6}\b/.test(t)) {
    flags.push("password_or_code");
  }

  if (URL_RE.test(t) || DOMAIN_RE.test(t)) flags.push("external_link");

  if (/\b(?:0[67])\d[ .-]?\d{2}[ .-]?\d{2}[ .-]?\d{2}[ .-]?\d{2}\b/.test(t)) flags.push("phone_number");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) flags.push("email_address");
  if (/\b(?:\d{1,3}[a-zA-Z]?(?:\s+bis)?[,\s]+(?:rue|avenue|bd|boulevard|all[eé]e|impasse|chemin|place|route))\b/i.test(t) ||
      /\b(?:chez\s+moi|mon\s+adresse(?:\s+est)?)\b/i.test(t)) {
    flags.push("home_address");
  }

  if (/\b(?:photos?|foto)\b[^.?!]{0,25}\b(?:corps|nus?|nues?|intimes?|sexy|sans\s+v[eê]tements?)\b/i.test(t) ||
      /\b(?:envoie|montre)\b[^.?!]{0,30}\b(?:nus?|nues?|intimes?|sexy)\b/i.test(t)) {
    flags.push("private_photos");
  }

  if (/\b(?:connard|salope|encul[ée]|fdp|ntm|nique\s+ta|tg\s|ferme\s+ta\s+gueule|cr[eé]tin|d[eé]bil?ote|dégueulasse)\b/i.test(t)) {
    flags.push("harassment");
  }

  if (/\b(?:sexe|sexuel|nudité|cul)\b/i.test(t)) flags.push("gross_or_sexual");

  if (flags.length === 0) return { flags: [], warning: null, blocked: false };

  const blocked = flags.some((f) => HARD_BLOCK_FLAGS.includes(f));
  const warning = `SÉCURITÉ — ${flags.map((f) => FLAG_WARNINGS[f]).join(" ")}`;
  return { flags, warning, blocked };
}
