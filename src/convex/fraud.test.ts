import { describe, expect, runTests, test } from "./lib/testing";
import { classifyMessage, scanMission } from "./lib/fraud";

describe("scanMission", () => {
  const base = {
    title: "Promenade de chien",
    description:
      "Je cherche quelqu'un de fiable pour promener mon chien Rex autour du parc. Laisse et sachets fournis.",
    priceEuros: 15,
    durationMin: 60,
  };

  test("a normal mission passes", () => {
    const r = scanMission(base);
    expect(r.blocked).toBe(false);
    expect(r.score).toBe(0);
  });

  test("unrealistic pay is flagged and blocks", () => {
    const r = scanMission({ ...base, priceEuros: 500, durationMin: 30 });
    expect(r.blocked).toBe(true);
    expect(r.reasons.some((x) => x.includes("irréaliste"))).toBe(true);
  });

  test("pay-to-work scam is blocked", () => {
    const r = scanMission({
      ...base,
      description:
        "Il y a des frais de dossier de 50 € pour accéder aux missions, puis achat du kit obligatoire.",
    });
    expect(r.blocked).toBe(true);
  });

  test("IBAN in the offer is blocked", () => {
    const r = scanMission({
      ...base,
      description: "Envoie ton IBAN FR76 3000 4000 pour être payé en avance.",
    });
    expect(r.blocked).toBe(true);
    expect(r.reasons.some((x) => x.toLowerCase().includes("bancaire"))).toBe(true);
  });

  test("external WhatsApp recruitment is blocked", () => {
    const r = scanMission({
      ...base,
      description: "Contacte-moi directement sur WhatsApp pour discuter, réponse rapide garantie.",
    });
    expect(r.blocked).toBe(true);
    expect(r.reasons.some((x) => x.includes("messagerie externe"))).toBe(true);
  });

  test("a mere email in the text is flagged but not blocked", () => {
    const r = scanMission({
      ...base,
      description: `${base.description} Questions : marie.exemple@yahoo.fr`,
    });
    expect(r.blocked).toBe(false);
    expect(r.reasons.some((x) => x.includes("email"))).toBe(true);
  });
});

describe("classifyMessage", () => {
  test("normal message is clean", () => {
    const r = classifyMessage("Bonjour, je serai là à 17h devant le parc, à tout à l'heure !");
    expect(r.flags).toEqual([]);
    expect(r.blocked).toBe(false);
  });

  test("IBAN request is flagged with a warning", () => {
    const r = classifyMessage("Tu peux me donner ton IBAN pour te payer en avance ?");
    expect(r.flags).toContain("bank_details");
    expect(r.flags).toContain("money_request");
    expect(r.blocked).toBe(false);
    expect(r.warning).toContain("ne communique jamais");
  });

  test("6-digit verification code is flagged", () => {
    const r = classifyMessage("Envoie-moi le code 483920 vite");
    expect(r.flags).toContain("password_or_code");
  });

  test("external link triggers a phishing warning", () => {
    const r = classifyMessage("Inscris-toi vite ici : http://bit.ly/arnaque");
    expect(r.flags).toContain("external_link");
  });

  test("request for private photos is hard-blocked", () => {
    const r = classifyMessage("Montre-moi des photos intimes");
    expect(r.blocked).toBe(true);
    expect(r.flags).toContain("private_photos");
  });

  test("cash payment outside the app is flagged", () => {
    const r = classifyMessage("On règle en cash directement, plus simple");
    expect(r.flags).toContain("off_platform_payment");
  });
});

void runTests();
