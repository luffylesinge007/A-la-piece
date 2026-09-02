import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { MissionCard } from "@/components/mission-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, getCategory } from "@/convex/lib/safety";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

const SORTS = [
  { id: "recent", label: "Plus récentes" },
  { id: "price_asc", label: "Prix croissant" },
  { id: "price_desc", label: "Mieux payées" },
  { id: "duration", label: "Plus courtes" },
  { id: "popular", label: "Populaires" },
];

export default function Missions() {
  const { user } = useAuth();
  const isTeen = user?.accountType === "teen";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [maxPrice, setMaxPrice] = useState<string>("all");
  const [maxDuration, setMaxDuration] = useState<string>("all");
  const [sort, setSort] = useState("recent");
  const [showFilters, setShowFilters] = useState(false);

  const missions = useQuery(api.missions.listMissions, {
    search: search.trim() || undefined,
    category: category !== "all" ? category : undefined,
    maxPrice: maxPrice !== "all" ? Number(maxPrice) : undefined,
    maxDuration: maxDuration !== "all" ? Number(maxDuration) : undefined,
  });

  const sorted = useMemo(() => {
    if (!missions) return [];
    const arr = [...missions];
    switch (sort) {
      case "price_asc": arr.sort((a: any, b: any) => a.priceEuros - b.priceEuros); break;
      case "price_desc": arr.sort((a: any, b: any) => b.priceEuros - a.priceEuros); break;
      case "duration": arr.sort((a: any, b: any) => a.durationMin - b.durationMin); break;
      case "popular": arr.sort((a: any, b: any) => (b.applicantCount ?? 0) - (a.applicantCount ?? 0)); break;
    }
    return arr;
  }, [missions, sort]);

  const shortcuts = [
    { id: "recent", emoji: "🆕", label: "Nouvelles" },
    { id: "popular", emoji: "🔥", label: "Populaires" },
    { id: "price_desc", emoji: "💰", label: "Mieux payées" },
    { id: "duration", emoji: "⚡", label: "Rapides" },
  ];

  const hasFilters = category !== "all" || maxPrice !== "all" || maxDuration !== "all";

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">🔎 Explorer les missions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeen
              ? "Chaque mission affiche si elle est autorisée pour ton âge."
              : "Un aperçu des missions publiées sur la plateforme."}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Que recherchez-vous ? (ex : chien, jardin, 2 heures…)"
            className="h-11 pl-10 text-base"
          />
          {search && (
            <button
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              aria-label="Effacer la recherche"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Shortcuts */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shortcuts.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                sort === s.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <span>{s.emoji}</span> {s.label}
            </button>
          ))}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
              showFilters || hasFilters ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
            }`}
          >
            <SlidersHorizontal className="size-3.5" /> Filtres
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <Card className="card-shadow animate-slide-up border-border/60">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>{c.emoji} {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Prix maximum</label>
                <Select value={maxPrice} onValueChange={setMaxPrice}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Peu importe</SelectItem>
                    <SelectItem value="10">≤ 10 €</SelectItem>
                    <SelectItem value="15">≤ 15 €</SelectItem>
                    <SelectItem value="20">≤ 20 €</SelectItem>
                    <SelectItem value="30">≤ 30 €</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Durée maximum</label>
                <Select value={maxDuration} onValueChange={setMaxDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Peu importe</SelectItem>
                    <SelectItem value="60">≤ 1 h</SelectItem>
                    <SelectItem value="120">≤ 2 h</SelectItem>
                    <SelectItem value="180">≤ 3 h</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => { setCategory("all"); setMaxPrice("all"); setMaxDuration("all"); }}
                >
                  <X className="size-4" /> Réinitialiser
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Grid */}
        {!missions ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : sorted.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <span className="text-4xl">🕵️</span>
              <p className="font-display text-lg font-bold">Aucune mission trouvée</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Essaie d'élargir tes filtres ou de supprimer la recherche. De nouvelles missions arrivent chaque jour !
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {sorted.length} mission{sorted.length > 1 ? "s" : ""}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {sorted.map((m: any) => <MissionCard key={m._id} mission={m} />)}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
