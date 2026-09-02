import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORIES, computeFee, getCategory } from "@/convex/lib/safety";
import { eurosFromNumber, formatDuration, friendlyError } from "@/lib/format";
import { ArrowLeft, Lightbulb, Loader2, Lock, Sparkles } from "lucide-react";
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

/** Simple natural-language extraction for the "simple mode". */
function parseSimple(text: string) {
  const t = text.toLowerCase();
  let price: number | undefined;
  const priceMatch = t.match(/(\d{1,3})\s*(?:€|euros?)/);
  if (priceMatch) price = Number(priceMatch[1]);

  let durationMin: number | undefined;
  const hMatch = t.match(/(\d+(?:,\d+)?)\s*h(?:eures?)?/);
  const minMatch = t.match(/(\d{2,3})\s*min/);
  if (hMatch) durationMin = Math.round(parseFloat(hMatch[1].replace(",", ".")) * 60);
  else if (minMatch) durationMin = Number(minMatch[1]);

  let daysAhead: number | undefined;
  if (t.includes("aujourd'hui")) daysAhead = 0;
  else if (t.includes("demain")) daysAhead = 1;
  else if (t.includes("après-demain") || t.includes("apres demain")) daysAhead = 2;

  const dayNames: Record<string, number> = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
  let weekday: string | undefined;
  for (const [name, idx] of Object.entries(dayNames)) {
    if (t.includes(name)) {
      weekday = name;
      const today = new Date().getDay();
      let diff = (idx - today + 7) % 7;
      if (diff === 0) diff = 7;
      daysAhead = diff;
      break;
    }
  }

  let categorySlug: string | undefined;
  if (/chien|chat|animal|promen/.test(t)) categorySlug = "animaux";
  else if (/jardin|tonte|pelouse|d[eé]sherb|plante/.test(t)) categorySlug = "jardinage";
  else if (/cours|devoir|soutien|math/.test(t)) categorySlug = "cours";
  else if (/informatique|ordinateur|pc|imprimante|tablette/.test(t)) categorySlug = "informatique";
  else if (/course|commission|acheter/.test(t)) categorySlug = "courses";
  else if (/m[eé]nage|nettoy/.test(t)) categorySlug = "menage";
  else if (/babysitt|garde d['']enfant/.test(t)) categorySlug = "babysitting";
  else if (/bricol|montage|étag[eè]re|etagere/.test(t)) categorySlug = "bricolage";

  return { price, durationMin, daysAhead, weekday, categorySlug };
}

function recommendPrice(categorySlug: string, durationMin: number): { min: number; max: number } {
  const base = BASE_RATES[categorySlug] ?? 11; // € per hour baseline
  const hours = durationMin / 60;
  const mid = Math.max(5, Math.round((base * hours) / 0.5) * 0.5);
  return { min: Math.max(3, Math.round(mid * 0.8 * 2) / 2), max: Math.round(mid * 1.2 * 2) / 2 };
}

export default function MissionCreate() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const createMission = useMutation(api.missions.createMission);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [publishing, setPublishing] = useState(false);

  // form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [durationMin, setDurationMin] = useState<number | "">("");
  const [date, setDate] = useState(isoDatePlus(3));
  const [time, setTime] = useState("14:00");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [skills, setSkills] = useState("");
  const [equipment, setEquipment] = useState("");
  const [safetyNotes, setSafetyNotes] = useState("");
  const [requiresPin, setRequiresPin] = useState(false);

  const applySimple = (text: string) => {
    const parsed = parseSimple(text);
    if (parsed.categorySlug) {
      setCategorySlug(parsed.categorySlug);
      const cat = getCategory(parsed.categorySlug)!;
      if (!title) setTitle(`${cat.emoji} ${cat.label}`);
    }
    if (parsed.durationMin) {
      setDurationMin(parsed.durationMin);
      if (typeof price !== "number") {
        const rec = recommendPrice(parsed.categorySlug ?? "animaux", parsed.durationMin);
        setPrice(Math.round((rec.min + rec.max) / 2));
      }
    }
    if (parsed.price) setPrice(parsed.price);
    if (parsed.daysAhead !== undefined) setDate(isoDatePlus(parsed.daysAhead));
    if (!description && text.trim().length > 20) setDescription(text.trim());
    toast.success("Mission pré-remplie ✨ — vérifie chaque champ avant de publier.");
  };
  void applySimple;

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
    if (typeof durationMin !== "number" || durationMin < 15 || durationMin > 480) return "La durée doit être entre 15 min et 8 h.";
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
        requiredSkills: skills.trim() ? skills.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        equipment: equipment.trim() || undefined,
        safetyNotes: safetyNotes.trim() || undefined,
        requiresPin,
        exactAddress: address.trim() || undefined,
      });
      toast.success("Mission publiée 🎉 Elle est visible par les utilisateurs du coin.");
      navigate("/mes-missions");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = user?.accountType === "adult" || user?.accountType === "organization";

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <Button variant="ghost" size="sm" asChild onClick={() => navigate(-1)}>
          <span><ArrowLeft className="size-4" /> Retour</span>
        </Button>

        {!canPublish ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <span className="text-4xl">🔒</span>
              <p className="font-display text-lg font-bold">Réservé aux comptes adultes</p>
              <p className="text-sm text-muted-foreground">
                Seuls les adultes et organisations peuvent publier des missions.
                {user?.accountType === "teen" && " En tant qu'ado, ta mission à toi : trouver la bonne et candidater !"}
              </p>
              <Button variant="outline" asChild onClick={() => navigate("/missions")}>
                <span>Explorer les missions</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">Publier une mission</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Décris ton besoin — les recommandations s'ajustent en direct.
              </p>
            </div>

            <Tabs defaultValue="simple">
              <TabsList className="w-full">
                <TabsTrigger value="simple" className="flex-1">⚡ Mode simple</TabsTrigger>
                <TabsTrigger value="advanced" className="flex-1">🧾 Mode avancé</TabsTrigger>
              </TabsList>

              <TabsContent value="simple" className="mt-4">
                <Card className="card-shadow border-border/60">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="simpleText">Décris ton besoin en une phrase</Label>
                      <Textarea
                        id="simpleText"
                        placeholder="Ex : J'ai besoin de quelqu'un pour promener mon chien samedi pendant une heure pour 15 €."
                        rows={3}
                        onChange={(e) => {
                          const t = e.target.value;
                          const parsed = parseSimple(t);
                          if (parsed.categorySlug) {
                            setCategorySlug(parsed.categorySlug);
                            const cat = getCategory(parsed.categorySlug)!;
                            if (!title) setTitle(`${cat.emoji} ${cat.label}`);
                          }
                          if (parsed.durationMin) setDurationMin(parsed.durationMin);
                          if (parsed.price) setPrice(parsed.price);
                          if (parsed.daysAhead !== undefined) setDate(isoDatePlus(parsed.daysAhead));
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      💡 La catégorie, la durée, la date et le prix sont extraits automatiquement. Vérifie et complète ci-dessous.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Catégorie détectée</Label>
                        <Select value={categorySlug} onValueChange={setCategorySlug}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c.slug} value={c.slug}>{c.emoji} {c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Durée (min)</Label>
                        <Input
                          type="number"
                          min={15}
                          max={480}
                          value={durationMin}
                          onChange={(e) => setDurationMin(e.target.value ? Number(e.target.value) : "")}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="advanced" className="mt-4">
                <Card className="card-shadow border-border/60">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="title">Titre *</Label>
                      <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Promenade de chien" maxLength={60} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="desc">Description *</Label>
                      <Textarea
                        id="desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Décris précisément la mission, le matériel fourni, les particularités…"
                        rows={4}
                        maxLength={1000}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Catégorie *</Label>
                        <Select value={categorySlug} onValueChange={setCategorySlug}>
                          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c.slug} value={c.slug}>{c.emoji} {c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Compétences souhaitées (séparées par des virgules)</Label>
                      <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Patience, Animaux" />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Common fields */}
            <Card className="card-shadow border-border/60">
              <CardContent className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="price">Prix (€) *</Label>
                    <Input
                      id="price"
                      type="number"
                      min={3}
                      max={500}
                      step={1}
                      value={price}
                      onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : "")}
                    />
                    {rec && typeof price === "number" && (price < rec.min || price > rec.max) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Hors fourchette recommandée — c'est ton choix, la transparence est préservée.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="when">Date *</Label>
                    <Input id="when" type="date" value={date} onChange={(e) => setDate(e.target.value)} min={isoDatePlus(0)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="time">Heure *</Label>
                    <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city">Ville *</Label>
                    <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder={profile?.city ?? "Bordeaux"} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="area">Zone approximative *</Label>
                  <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Quartier des Chartrons" />
                  <p className="text-xs text-muted-foreground">Visible par tous. N'écris jamais l'adresse complète ici.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address">Adresse exacte (privée)</Label>
                  <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue de l'Exemple" />
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3" /> Visible uniquement après confirmation de la réservation.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="equipment">Matériel fourni</Label>
                  <Input id="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Laisse, gants…" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="safety">Consignes de sécurité</Label>
                  <Input id="safety" value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} placeholder="Chien calme, prévoir de l'eau…" />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Code PIN au démarrage</p>
                    <p className="text-xs text-muted-foreground">L'ado devra saisir le code que tu lui donnes sur place.</p>
                  </div>
                  <Switch checked={requiresPin} onCheckedChange={setRequiresPin} />
                </div>

                {fee !== null && (
                  <p className="text-xs text-muted-foreground">
                    Commission plateforme : {eurosFromNumber(fee)} (10 %) — versée par l'adulte, l'ado reçoit {eurosFromNumber((price as number) - fee)}.
                  </p>
                )}
              </CardContent>
            </Card>

            {step === "edit" ? (
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  const problem = validate();
                  if (problem) toast.error(problem);
                  else setStep("preview");
                }}
              >
                Vérifier ma mission
              </Button>
            ) : (
              <Card className="card-shadow-lg animate-slide-up border-primary/40">
                <CardContent className="space-y-4 p-5">
                  <h3 className="font-display text-lg font-bold">Vérifier votre mission</h3>
                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{getCategory(categorySlug)?.emoji}</span>
                      <Badge variant="secondary">{getCategory(categorySlug)?.label}</Badge>
                    </div>
                    <p className="mt-2 font-display font-bold">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>💰 {eurosFromNumber(price as number)}</span>
                      <span>⏱️ {formatDuration(durationMin as number)}</span>
                      <span>📅 {date} à {time}</span>
                      <span>📍 {area}, {city}</span>
                      {requiresPin && <span>🔒 Code PIN</span>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    🛡️ Le niveau d'accès (🟢🟡🔴) sera calculé automatiquement à la publication selon l'âge, la catégorie et l'horaire.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("edit")}>Modifier</Button>
                    <Button className="flex-1" onClick={publish} disabled={publishing}>
                      {publishing ? <Loader2 className="size-4 animate-spin" /> : <><Sparkles className="size-4" /> Publier</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {rec && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="flex items-start gap-3 p-4">
                  <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold">
                      💡 Prix recommandé : {eurosFromNumber(rec.min)} – {eurosFromNumber(rec.max)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Basé sur la catégorie, la durée ({formatDuration(durationMin as number)}) et les usages locaux. Le prix reste modifiable.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
