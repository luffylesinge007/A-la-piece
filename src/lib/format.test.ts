import { describe, expect, runTests, test } from "../convex/lib/testing";
import {
  BOOKING_STATUS_META,
  euros,
  eurosFromNumber,
  formatDuration,
  formatTime,
  friendlyError,
  initials,
} from "./format";

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------
describe("euros / eurosFromNumber", () => {
  test("formats cents as a French euro amount", () => {
    const out = euros(1500);
    expect(out).toContain("15");
    expect(out).toContain("€");
  });

  test("handles zero and small amounts without crashing", () => {
    expect(euros(0)).toContain("0");
    expect(euros(99)).toContain("0,99");
  });

  test("eurosFromNumber formats a euro value directly", () => {
    const out = eurosFromNumber(12.5);
    expect(out).toContain("12,5");
    expect(out).toContain("€");
  });
});

// ---------------------------------------------------------------------------
// Durée
// ---------------------------------------------------------------------------
describe("formatDuration", () => {
  test("minutes under an hour", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(30)).toBe("30 min");
  });

  test("whole hours drop the minutes", () => {
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(120)).toBe("2 h");
  });

  test("mixed hours and minutes are zero-padded", () => {
    expect(formatDuration(90)).toBe("1 h 30");
    expect(formatDuration(65)).toBe("1 h 05");
  });
});

// ---------------------------------------------------------------------------
// Heure
// ---------------------------------------------------------------------------
describe("formatTime", () => {
  test("renders a 24h HH:mm French timestamp", () => {
    expect(formatTime(new Date(2026, 5, 6, 14, 5).getTime())).toBe("14:05");
  });
});

// ---------------------------------------------------------------------------
// Erreurs utilisateur
// ---------------------------------------------------------------------------
describe("friendlyError", () => {
  test("strips Convex error prefixes and keeps the friendly message", () => {
    expect(friendlyError(new Error("Error: FORBIDDEN: Tu n'es pas autorisé."))).toBe(
      "Tu n'es pas autorisé.",
    );
    expect(friendlyError("NOT_FOUND: Mission introuvable")).toBe("Mission introuvable");
    expect(friendlyError("Error: PAYMENT_NOT_CONFIGURED: Paiement à configurer.")).toBe(
      "Paiement à configurer.",
    );
  });

  test("falls back to a generic French message for unknown inputs", () => {
    expect(friendlyError(undefined)).toContain("Une erreur est survenue");
    expect(friendlyError({ weird: true })).toContain("Une erreur est survenue");
  });

  test("keeps unknown messages readable but cleaned", () => {
    expect(friendlyError(new Error("Uncaught Error: boom"))).toBe("boom");
  });
});

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------
describe("initials", () => {
  test("takes the first letters of the first two parts", () => {
    expect(initials("Oscar T.")).toBe("OT");
    expect(initials("emma")).toBe("E");
  });
});

describe("status metadata", () => {
  test("every booking status has a label and a step", () => {
    for (const meta of Object.values(BOOKING_STATUS_META)) {
      expect(meta.label).toBeTruthy();
      expect(meta.step).toBeGreaterThanOrEqual(0);
    }
  });
});

await runTests("src/lib/format.test.ts");
