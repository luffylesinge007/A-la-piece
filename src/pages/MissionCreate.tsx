import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CATEGORIES, computeFee, getCategory } from "@/convex/lib/safety";
import { DataIcon } from "@/components/icons";
import { eurosFromNumber, formatDuration, friendlyError } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, CalendarDays, Clock, Lightbulb, Loader2, Lock, MapPin, ShieldAlert, Sparkles, Zap, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const BASE_RATES: Record<string, number> = {
  animaux: 12, jardinage: 10, cours: 15, informatique: 14, courses: 10,
  menage: 11, evenements: 12, babysitting: 10, bricolage: 14, livraison: 12,
};

function isoDatePlus(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function recommendPrice(categorySlug: string, durationMin: number): { min: number; max: number } {
  const base = BASE_RATES[categorySlug] ?? 11;
  const hours = durationMin / 60;
  const mid = Math.max(5, Math.round((base * hours) / 0.5) * 0.5);
  return { min: Math.max(3, Math.round(mid * 0.8 * 2) / 2), max: Math.round(mid * 1.2 * 2) / 2 };
}

const STEPS = ["Besoin", "Description", "Quand", "Prix", "Type", "Lieu", "Résumé"];

export default function MissionCreate() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const createMission = useMutation(api.missions.createMission);
  const [step, setStep] = useState(0);
  const [publishing, setPublishing] = useState(false);

  // form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [durationMin, setDurationMin] = useState<number | "">("");
  const [date, setDate] = useState(isoDatePlus(3));
  const [time, setTime] = useState("14:00");
  const [missionType, setMissionType] = useState<"quick" | "verified">("verified");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [skills, setSkills] = useState("");
  const [equipment, setEquipment] = useState("");
  const [safetyNotes, setSafetyNotes] = useState("");
  const [requiresPin, setRequiresPin] = useState(false);

  const rec = useMemo(() => {
    if (!categorySlug || !durationMin) return null;
    return recommendPrice(categorySlug, durationMin);
  }, [categorySlug, durationMin]);

  const fee = typeof price === "number" ? computeFee(price) : null;

  const validate = (): string | null => {
    if (!title.trim()) return "Le titre est obligatoire.";
    if (!description.trim()) return "La description est obligatoire.";
    if (!categorySlug) return "Choisis une catégorie.";
    if (typeof price !== "number" || price < 3 || price > 500) return "Le prix doit être entre 3 € et 500 €.";
    if (typeof durationMin !== "number" || durationMin < 15 || durationMin > 480)
      return "La durée doit être entre 15 min et 8 h.";
    if (!city.trim()) return "La ville est obligatoire.";
    if (!area.trim()) return "Indique la zone approximative (quartier).";
    return null;
  };

  const publish = async () => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setPublishing(true);
    try {
      await createMission({
        title: title.trim(),
        description: description.trim(),
        categorySlug,
        priceEuros: price as number,
        durationMin: durationMin as number,
        scheduledDate: date,
        scheduledTime: time,
        city: city.trim(),
        area: area.trim(),
        missionType,
        maxApplicants: 5,
        requiredSkills: skills.trim() ? skills.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        equipment: equipment.trim() || undefined,
        safetyNotes: safetyNotes.trim() || undefined,
        requiresPin,
        exactAddress: address.trim() || undefined,
      });
      toast.success(
        missionType === "quick"
          ? "Mission rapide publiée ! Le premier ado disponible peut la prendre."
          : "Mission vérifiée publiée ! Les 5 premiers candidats peuvent postuler.",
      );
      navigate("/mes-missions");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = user?.accountType === "adult" || user?.accountType === "organization";
  const canContinue = () => {
    switch (step) {
      case 0: return categorySlug !== "" && title.trim() !== "";
      case 1: return description.trim().length >= 10;
      case 2: return date !== "" && time !== "" && typeof durationMin === "number" && durationMin >= 15;
      case 3: return typeof price === "number" && price >= 3;
      default: return true;
    }
  };

  if (!canPublish) {
    return (
      <AppShell>
        <EmptyState
          icon={<Lock className="size-7" />}
          title="Réservé aux comptes adultes"
          description="Seuls les adultes et organisations publient des missions. En tant qu'ado, ta mission à toi : trouver la bonne et candidater !"
          actions={[{ label: "Explorer les missions", to: "/missions" }]}
        />
      </AppShell>
    );
  }

  const cat = getCategory(categorySlug);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => (step === 0 ? navigate("/accueil") : setStep(step - 1))} aria-label="Retour">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">Publier une mission</h1>
            <p className="text-sm text-muted-foreground">
              Étape {step + 1}/7 — {STEPS[step]}
            </p>
          </div>
        </div>
        <Progress value={((step + 1) / 7) * 100} className="h-1.5" />

        {/* STEP 0 — Besoin / catégorie */}
        {step === 0 && (
          <Card className="card-shadow animate-slide-up border-border/60">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="font-display text-lg font-bold">De quoi avez-vous besoin ?</h2>
                <p className="text-sm text-muted-foreground">Choisis la catégorie, puis nomme ta mission.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.slug}
                    onClick={() => {
                      setCategorySlug(c.slug);
                      if (!title) setTitle(`${c.label}`);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all",
                      categorySlug === c.slug
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40"
                        : "border-border hover:border-primary/40",
                      c.risk === "high" && "opacity-75",
                    )}
                  >
                    <span className="text-primary"><DataIcon name={c.icon} className="size-5" /></span>
                    <span className="text-[11px] font-medium leading-tight">{c.label}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Titre de la mission *</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Promenade de chien" maxLength={60} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 1 — Description */}
        {step === 1 && (
          <Card className="card-shadow animate-slide-up border-border/60">
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-lg font-bold">Décrivez votre mission</h2>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex : Je cherche quelqu'un de fiable pour promener mon chien Rex autour du parc. Laisse et sachets fournis."
                rows={6}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">
                Indique le matériel fourni et les particularités : plus c'est clair, plus les candidatures sont de qualité.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Durée (min) *</Label>
                  <Input
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Compétences (optionnel)</Label>
                  <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Patience, Animaux" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2 — Quand */}
        {step === 2 && (
          <Card className="card-shadow animate-slide-up border-border/60">
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-lg font-bold">Quand ?</h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Aujourd'hui", days: 0 },
                  { label: "Demain", days: 1 },
                ].map((q) => (
                  <button
                    key={q.label}
                    onClick={() => setDate(isoDatePlus(q.days))}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                      date === isoDatePlus(q.days)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    {q.label}
                  </button>
                ))}
                <Input
                  type="date"
                  value={date}
                  min={isoDatePlus(0)}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-auto"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Heure *</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Durée (min) *</Label>
                  <Input
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value ? Number(e.target.value) : "")}
                  />
                  {rec && typeof durationMin === "number" && (
                    <p className="text-[11px] text-muted-foreground">{formatDuration(durationMin)} estimé</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3 — Prix */}
        {step === 3 && (
          <Card className="card-shadow animate-slide-up border-border/60">
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-lg font-bold">Combien proposez-vous ?</h2>
              <div className="space-y-1.5">
                <div className="relative">
                  <Input
                    id="price"
                    type="number"
                    min={3}
                    max={500}
                    value={price}
                    onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : "")}
                    className="h-14 pr-10 text-2xl font-extrabold"
                    placeholder="15"
                  />
                  <span className="absolute right-4 top-4 font-display text-lg text-muted-foreground">€</span>
                </div>
              </div>
              {rec && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  <div className="text-sm">
                    <p className="font-semibold">
                      Prix recommandé : {eurosFromNumber(rec.min)} – {eurosFromNumber(rec.max)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Basé sur la catégorie {cat?.label}, la durée ({formatDuration(durationMin as number)}) et les usages locaux. Modifiable.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7"
                      onClick={() => setPrice(Math.round((rec.min + rec.max) / 2))}
                    >
                      Utiliser la recommandation
                    </Button>
                  </div>
                </div>
              )}
              {fee !== null && (
                <p className="text-xs text-muted-foreground">
                  Commission plateforme : {eurosFromNumber(fee)} (10 %) — l'adolescent reçoit {eurosFromNumber((price as number) - fee)}.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 4 — Type de mission */}
        {step === 4 && (
          <Card className="card-shadow animate-slide-up border-border/60">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="font-display text-lg font-bold">Quel type de mission ?</h2>
                <p className="text-sm text-muted-foreground">Le mode de sélection change complètement.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setMissionType("quick")}
                  className={cn(
                    "rounded-2xl border-2 p-4 text-left transition-all",
                    missionType === "quick" ? "border-amber-500 bg-amber-500/5 shadow-md" : "border-border hover:border-amber-500/40",
                  )}
                >
                  <span className="flex items-center gap-2 font-display font-bold">
                    <Zap className="size-4 text-amber-500" /> Mission rapide
                  </span>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Le <strong>premier adolescent disponible</strong> clique sur « Je prends la mission » — il est sélectionné automatiquement.
                  </p>
                  <p className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">Idéal pour un besoin urgent</p>
                </button>
                <button
                  onClick={() => setMissionType("verified")}
                  className={cn(
                    "rounded-2xl border-2 p-4 text-left transition-all",
                    missionType === "verified" ? "border-brand bg-brand/5 shadow-md" : "border-border hover:border-brand/40",
                  )}
                >
                  <span className="flex items-center gap-2 font-display font-bold">
                    <ShieldCheck className="size-4 text-brand" /> Mission vérifiée
                  </span>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Les <strong>5 premiers intéressés</strong> candidatent, tu compares leurs profils et tu choisis.
                  </p>
                  <p className="mt-2 text-[11px] font-medium text-brand dark:text-coin">Idéal pour choisir la bonne personne</p>
                </button>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Code PIN au démarrage</p>
                  <p className="text-xs text-muted-foreground">L'ado devra saisir le code que tu lui donnes sur place.</p>
                </div>
                <Switch checked={requiresPin} onCheckedChange={setRequiresPin} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 5 — Lieu */}
        {step === 5 && (
          <Card className="card-shadow animate-slide-up border-border/60">
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-lg font-bold">Où ?</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city">Ville *</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder={profile?.city ?? "Bordeaux"} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="area">Zone approximative *</Label>
                  <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Quartier des Chartrons" />
                </div>
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> La zone est visible par tous — n'écrivez jamais l'adresse complète ici.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="address">Adresse exacte (privée)</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue de l'Exemple" />
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" /> Visible uniquement après confirmation de la réservation.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 6 — Résumé */}
        {step === 6 && (
          <Card className="card-shadow-lg animate-slide-up border-primary/40">
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-lg font-bold">Vérifiez votre mission</h2>
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-xl bg-secondary text-primary">
                      <DataIcon name={cat?.icon} className="size-6" />
                    </span>
                    <div>
                      <p className="font-display font-bold">{title}</p>
                      <Badge variant="secondary">{cat?.label}</Badge>
                    </div>
                  </div>
                  <span className="font-display text-2xl font-extrabold text-primary">{eurosFromNumber(price as number)}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{description}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="size-3" /> {formatDuration(durationMin as number)}</span>
                  <span className="flex items-center gap-1"><CalendarDays className="size-3" /> {date} à {time}</span>
                  <span className="flex items-center gap-1"><MapPin className="size-3" /> {area}, {city}</span>
                  {requiresPin && <span className="flex items-center gap-1"><Lock className="size-3" /> Code PIN</span>}
                </div>
              </div>
              <div className={cn("rounded-xl border p-3 text-sm", missionType === "quick" ? "border-amber-500/40 bg-amber-500/5" : "border-brand/40 bg-brand/5")}>
                {missionType === "quick" ? (
                  <p><Zap className="mr-1 inline size-4 text-amber-500" /> <strong>Mission rapide</strong> — le premier ado disponible la prendra automatiquement.</p>
                ) : (
                  <p><ShieldCheck className="mr-1 inline size-4 text-brand" /> <strong>Mission vérifiée</strong> — tu choisiras parmi les 5 premiers candidats.</p>
                )}
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Le niveau d'accès (autorisée / autorisation nécessaire) est calculé automatiquement
                  à la publication selon l'âge, la catégorie et l'horaire.
                </span>
              </p>
              <Button size="lg" className="w-full" onClick={publish} disabled={publishing}>
                {publishing ? <Loader2 className="size-4 animate-spin" /> : <><Sparkles className="size-4" /> Publier ma mission</>}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        {step < 6 && (
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="size-4" /> Retour
              </Button>
            )}
            <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={!canContinue()}>
              Continuer <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
