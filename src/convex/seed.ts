import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { evaluateTeenAccess } from "./lib/safety";

function isoDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function isoTime(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Seed demo data (demo publishers + published missions).
 * Clearly labelled as demo in the UI. Skipped when missions already exist.
 */
export const seedDemoMissions = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("missions").first();
    if (existing) return { seeded: false };

    const demoAdults = [
      { first: "Marie", city: "Bordeaux", emoji: "👩‍🦰", bio: "J'ai deux chats et un jardin — toujours contente d'avoir un coup de main !" },
      { first: "Thomas", city: "Bordeaux", emoji: "🧔", bio: "Télétravail, PC capricieux et box qui déconnecte : j'ai besoin d'aide régulièrement." },
      { first: "Sophie", city: "Mérignac", emoji: "👩", bio: "Coiffeuse, je manque de temps pour les petites courses de la semaine." },
    ];

    const adultIds = [];
    for (const adult of demoAdults) {
      const userId = await ctx.db.insert("users", {
        name: `${adult.first} (démo)`,
        accountType: "adult",
        onboarded: true,
      });
      await ctx.db.insert("profiles", {
        userId,
        accountType: "adult",
        firstName: adult.first,
        city: adult.city,
        bio: adult.bio,
        avatarEmoji: adult.emoji,
        verifiedEmail: true,
        status: "active",
      });
      adultIds.push(userId);
    }

    const demo = [
      {
        title: "Promenade de chien",
        description:
          "Je cherche quelqu'un de fiable pour promener mon chien Rex (golden retriever, très gentil) autour du parc. Il tire un peu au début, le temps de passer l'excitation. La laisse et des sachets sont fournis.",
        categorySlug: "animaux",
        priceEuros: 15,
        durationMin: 60,
        date: 1,
        hour: 17,
        area: "Quartier Bassins à flot",
        city: "Bordeaux",
        skills: ["Animaux"],
        equipment: "Laisse et sachets fournis",
        safety: "Rex est vacciné et calme. Prévois des chaussures confortables.",
        pin: true,
        address: "12 rue de l'Exemple, Bordeaux",
      },
      {
        title: "Aide au jardinage",
        description:
          "Désherber le devant de la maison et arroser les tomates. Les gants et l'arrosoir sont prêts dans l'abri. Si tu connais les plantes, encore mieux — mais ce n'est pas obligatoire.",
        categorySlug: "jardinage",
        priceEuros: 20,
        durationMin: 120,
        date: 3,
        hour: 14,
        area: "Quartier Chartrons",
        city: "Bordeaux",
        skills: ["Jardinage"],
        equipment: "Gants et outils fournis",
        safety: "Pense à boire de l'eau s'il fait chaud. Aucun produit chimique.",
        pin: false,
        address: "8 allée des Tilleuls, Bordeaux",
      },
      {
        title: "Cours d'informatique — tablette",
        description:
          "Ma mère de 78 ans a besoin d'aide pour utiliser sa tablette : appels vidéo, photos, messages. Il faut de la patience et le sourire. Session d'essai possible.",
        categorySlug: "informatique",
        priceEuros: 18,
        durationMin: 90,
        date: 2,
        hour: 15,
        area: "Centre-ville",
        city: "Bordeaux",
        skills: ["Informatique", "Pédagogie"],
        equipment: "Tablette sur place",
        safety: "Tu seras en présence de la propriétaire pendant toute la session.",
        pin: false,
        address: "24 rue Sainte-Catherine, Bordeaux",
      },
      {
        title: "Courses hebdomadaires",
        description:
          "Faire les courses avec la liste que je te donne (une quinzaine d'articles) et les rapporter. Je règle les courses en plus de ta rémunération. Panier pas trop lourd, j'ai un chariot.",
        categorySlug: "courses",
        priceEuros: 12,
        durationMin: 60,
        date: 4,
        hour: 10,
        area: "Quartier Mériadeck",
        city: "Bordeaux",
        skills: [],
        equipment: "Chariot fourni",
        safety: "Le ticket de caisse est remboursé en plus — garde-le bien.",
        pin: false,
        address: "Rue du marché, Bordeaux",
      },
      {
        title: "Tonte de pelouse",
        description:
          "Tondre une pelouse de 200 m² avec la tondeuse électrique de la maison. Surfaces simples, peu d'obstacles. La mission demande de la rigueur sur les bordures.",
        categorySlug: "jardinage",
        priceEuros: 25,
        durationMin: 150,
        date: 5,
        hour: 10,
        area: "Quartier Bacalan",
        city: "Bordeaux",
        skills: ["Jardinage", "Soin du détail"],
        equipment: "Tondeuse électrique fournie",
        safety: "Machines électriques : port de chaussures fermées obligatoire. Mission réservée aux adultes.",
        pin: true,
        address: "3 impasse des Acacias, Bordeaux",
      },
      {
        title: "Garde d'enfants en soirée",
        description:
          "Garder deux enfants (4 et 7 ans) de 19h à 22h : dîner préparé, devoir de lecture, coucher à 20h30. Expérience demandée avec les jeunes enfants.",
        categorySlug: "babysitting",
        priceEuros: 30,
        durationMin: 180,
        date: 6,
        hour: 19,
        area: "Quartier Gambetta",
        city: "Bordeaux",
        skills: ["Garde d'enfants"],
        equipment: "Repas préparé",
        safety: "Mission réservée aux majeurs (garde d'enfants en soirée).",
        pin: true,
        address: "17 rue Notre-Dame, Bordeaux",
      },
    ];

    for (let i = 0; i < demo.length; i++) {
      const m = demo[i];
      const publisherId = adultIds[i % adultIds.length];
      const risk = m.categorySlug === "babysitting" ? "high" : "low";
      const access = evaluateTeenAccess(
        {
          categorySlug: m.categorySlug,
          riskLevel: risk as "low" | "medium" | "high",
          scheduledDate: isoDate(m.date),
          scheduledTime: isoTime(m.hour),
          durationMin: m.durationMin,
        },
        16,
      );
      await ctx.db.insert("missions", {
        publisherId,
        title: m.title,
        description: m.description,
        categorySlug: m.categorySlug,
        priceEuros: m.priceEuros,
        durationMin: m.durationMin,
        scheduledDate: isoDate(m.date),
        scheduledTime: isoTime(m.hour),
        city: m.city,
        area: m.area,
        status: "published",
        riskLevel: risk as "low" | "medium" | "high",
        allowedForTeens: access.level !== "adults_only",
        accessNote: access.reasons[0],
        requiredSkills: m.skills,
        equipment: m.equipment,
        safetyNotes: m.safety,
        requiresPin: m.pin,
        applicantCount: 0,
        createdAt: Date.now() - i * 3_600_000,
        exactAddress: m.address,
      });
    }

    return { seeded: true, missions: demo.length };
  },
});

/** Validation-only arg helper so the mutation is callable from the client. */
export const _unused = v.any();
