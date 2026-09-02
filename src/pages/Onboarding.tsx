import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { friendlyError } from "@/lib/format";

type Role = "teen" | "adult" | "parent" | "organization";

export const AVATAR_CHOICES = ["🧑‍🎓", "👩‍🎓", "👦", "👧", "🧑", "👩", "👨", "🦸", "🐱", "🦊", "🐼", "🦉"];

const ROLE_CARDS: { id: Role; emoji: string; title: string; desc: string }[] = [
  { id: "teen", emoji: "🧑‍🎓", title: "Je suis adolescent", desc: "Trouve des missions adaptées à ton âge et gagne de l'argent en rendant service." },
  { id: "adult", emoji: "👨", title: "Je suis adulte", desc: "Publie des missions, choisis ton aide et paye en toute sécurité." },
  { id: "parent", emoji: "👨‍👩‍👧", title: "Je suis parent / responsable", desc: "Accompagne un adolescent : autorisations, suivi et alertes." },
  { id: "organization", emoji: "🏢", title: "Je représente une organisation", desc: "Associations, commerces et entreprises publient leurs missions." },
];

const INTERESTS = ["🐶 Animaux", "💻 Informatique", "🌳 Jardinage", "📚 Cours", "📸 Photo", "🎮 Jeux vidéo", "⚽ Sport", "🎨 Créatif"];
const SKILLS = ["Patience", "Organisation", "Soin du détail", "Ponctualité", "Force physique", "Pédagogie", "Animaux", "Cuisine"];
const AVAILABILITIES = ["Lun aprem", "Mar aprem", "Mer journée", "Jeu aprem", "Ven aprem", "Sam journée", "Dim journée"];

export default function Onboarding() {
  const { user, isLoading, needsOnboarding } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselected = (params.get("as") as Role | null) ?? null;

  const [step, setStep] = useState<"role" | "form" | "parent-link">(preselected ? "form" : "role");
  const [role, setRole] = useState<Role>(preselected ?? "teen");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("🧑‍🎓");
  const [interests, setInterests] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);
  const [parentEmail, setParentEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const completeOnboarding = useMutation(api.profiles.completeOnboarding);
  const linkParent = useMutation(api.profiles.linkParent);

  useEffect(() => {
    if (!isLoading && user && !needsOnboarding) navigate("/accueil", { replace: true });
  }, [isLoading, user, needsOnboarding, navigate]);

  useEffect(() => {
    if (preselected) {
      setRole(preselected);
      setStep("form");
      setAvatar(preselected === "teen" ? "🧑‍🎓" : "👤");
    }
  }, [preselected]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((i) => i !== value) : [...list, value]);
  };

  const chip = (value: string, active: boolean, onClick: () => void) => (
    <button
      key={value}
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {value}
    </button>
  );

  const submit = async () => {
    if (!firstName.trim()) {
      toast.error("Indique ton prénom pour continuer.");
      return;
    }
    if (role === "teen" && !birthDate) {
      toast.error("La date de naissance permet d'adapter les missions autorisées.");
      return;
    }
    setSaving(true);
    try {
      await completeOnboarding({
        accountType: role,
        firstName: firstName.trim(),
        lastName: role !== "teen" && lastName.trim() ? lastName.trim() : undefined,
        city: city.trim() || undefined,
        birthDate: role === "teen" ? birthDate : undefined,
        avatarEmoji: avatar,
        bio: bio.trim() || undefined,
        interests: interests.length ? interests : undefined,
        skills: skills.length ? skills : undefined,
        availability: availability.length ? availability : undefined,
      });
      if (role === "teen") {
        setStep("parent-link");
      } else {
        toast.success("Bienvenue sur À LA PIÈCE 🎉");
        navigate(role === "parent" ? "/securite" : "/accueil");
      }
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const submitParentLink = async () => {
    if (!parentEmail.trim()) {
      navigate("/accueil");
      return;
    }
    setSaving(true);
    try {
      await linkParent({ parentEmail: parentEmail.trim() });
      toast.success("Demande envoyée à ton responsable ✅");
      navigate("/accueil");
    } catch (error) {
      // The account is created; the link can be added later from Sécurité.
      toast.error(friendlyError(error));
      navigate("/accueil");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-background">
      <div className="hero-grid absolute inset-x-0 top-0 h-64" aria-hidden />
      <div className="relative mx-auto max-w-xl px-4 py-10">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl font-extrabold tracking-tight">À LA PIÈCE</span>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  (step === "role" && s === 1) || (step === "form" && s === 2) || (step === "parent-link" && s === 3)
                    ? "w-8 bg-primary"
                    : "w-4 bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        {step === "role" && (
          <div className="animate-slide-up">
            <h1 className="text-center font-display text-2xl font-extrabold">Qui es-tu ?</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Ton expérience sera adaptée à ton rôle.
            </p>
            <div className="mt-6 space-y-3">
              {ROLE_CARDS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setRole(r.id); setStep("form"); if (r.id !== "teen") setAvatar("👤"); }}
                  className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md card-shadow"
                >
                  <span className="text-3xl">{r.emoji}</span>
                  <span className="flex-1">
                    <span className="block font-display font-bold">{r.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{r.desc}</span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "form" && (
          <Card className="card-shadow-lg animate-slide-up border-border/60">
            <CardContent className="space-y-5 p-6">
              <div>
                <h1 className="font-display text-2xl font-extrabold">
                  {role === "teen" && "Crée ton profil ado 🧑‍🎓"}
                  {role === "adult" && "Crée ton profil adulte 👨"}
                  {role === "parent" && "Votre profil de responsable 👨‍👩‍👧"}
                  {role === "organization" && "Votre organisation 🏢"}
                </h1>
                <button className="mt-1 text-sm text-primary hover:underline" onClick={() => setStep("role")}>
                  ← Changer de rôle
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Prénom *</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Oscar" maxLength={30} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">{role === "teen" ? "Nom (privé)" : "Nom"}</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Martin" maxLength={30} />
                </div>
              </div>

              {role === "teen" && (
                <div className="space-y-1.5">
                  <Label htmlFor="birthDate">Date de naissance *</Label>
                  <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    🔒 Jamais visible publiquement. Sert uniquement à évaluer les missions autorisées.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="city">Ville / zone</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bordeaux" maxLength={40} />
              </div>

              <div className="space-y-1.5">
                <Label>Avatar</Label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_CHOICES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAvatar(a)}
                      className={`grid size-11 place-items-center rounded-xl border text-xl transition-all ${
                        avatar === a ? "border-primary bg-primary/10 scale-105" : "border-border hover:border-primary/40"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {role === "teen" && (
                <>
                  <div className="space-y-2">
                    <Label>Centres d'intérêt</Label>
                    <div className="flex flex-wrap gap-2">
                      {INTERESTS.map((i) => chip(i, interests.includes(i), () => toggle(interests, setInterests, i)))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Compétences</Label>
                    <div className="flex flex-wrap gap-2">
                      {SKILLS.map((s) => chip(s, skills.includes(s), () => toggle(skills, setSkills, s)))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Disponibilités</Label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABILITIES.map((a) => chip(a, availability.includes(a), () => toggle(availability, setAvailability, a)))}
                    </div>
                  </div>
                </>
              )}

              {role !== "teen" && (
                <div className="space-y-1.5">
                  <Label htmlFor="bio">
                    {role === "organization" ? "Description de l'organisation" : "Présentation"}
                  </Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={role === "organization" ? "Association, commerce, entreprise…" : "Quelques mots sur vous"}
                    rows={3}
                    maxLength={300}
                  />
                </div>
              )}

              <Button className="w-full" size="lg" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer mon compte"}
                {!saving && <ArrowRight className="size-4" />}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "parent-link" && (
          <Card className="card-shadow-lg animate-slide-up border-border/60">
            <CardContent className="space-y-5 p-6 text-center">
              <span className="text-5xl">👨‍👩‍👧</span>
              <div>
                <h1 className="font-display text-2xl font-extrabold">Un adulte de confiance</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ajoute un parent ou responsable : il pourra autoriser certaines missions 🟡
                  et recevoir des alertes importantes. Tu pourras aussi le faire plus tard.
                </p>
              </div>
              <div className="space-y-1.5 text-left">
                <Label htmlFor="parentEmail">Email du responsable (optionnel)</Label>
                <Input
                  id="parentEmail"
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@exemple.fr"
                />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  Ton responsable doit avoir un compte « Parent » sur À LA PIÈCE.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="lg" onClick={submitParentLink} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Envoyer la demande"}
                </Button>
                <Button variant="ghost" onClick={() => navigate("/accueil")} disabled={saving}>
                  Plus tard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
