import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { motion } from "framer-motion";
import {
  ArrowRight, BadgeCheck, CircleDot, CircleCheck, Ban, CreditCard, GraduationCap,
  Hand, HeartHandshake, Laptop, Lock, MapPin, MousePointerClick, PawPrint, Search,
  ShieldCheck, Sparkles, Star, Timer, UserRound, Wallet, Hammer, Sprout, type LucideIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

const DEMO_MISSIONS: { icon: LucideIcon; title: string; price: string; duration: string; zone: string; tag: string; tagClass: string }[] = [
  {
    icon: PawPrint,
    title: "Promenade de chien",
    price: "15 €",
    duration: "1 h",
    zone: "à ~800 m",
    tag: "Autorisée",
    tagClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: Sprout,
    title: "Désherbage du jardin",
    price: "20 €",
    duration: "2 h",
    zone: "à ~1,2 km",
    tag: "Autorisation parentale",
    tagClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    icon: Hammer,
    title: "Montage d'étagère",
    price: "35 €",
    duration: "2 h 30",
    zone: "à ~2 km",
    tag: "Réservée aux majeurs",
    tagClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
];

const TEEN_STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Search, title: "Trouve une mission", text: "Filtre par quartier, prix, durée. Chaque mission affiche si elle est autorisée pour ton âge." },
  { icon: Hand, title: "Candidate en 1 minute", text: "Un message suffit. L'adulte voit ton profil, tes compétences et ta réputation." },
  { icon: CircleCheck, title: "Réussis la mission", text: "Check-in, check-out, code PIN si besoin. Puis paiement direct dans ton portefeuille." },
];

const ADULT_STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Timer, title: "Publie en 2 minutes", text: "Décris ton besoin. Le moteur de prix suggère un montant juste, ajustable." },
  { icon: GraduationCap, title: "Choisis ton aide", text: "Reçois des candidatures avec profils, compétences et compatibilité détaillée." },
  { icon: CreditCard, title: "Paye en sécurité", text: "Paiement Stripe au moment de la réservation. Les fonds sont versés après la mission." },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="À LA PIÈCE" className="size-8 rounded-lg" />
            <span className="font-display text-lg font-extrabold tracking-tight">À LA PIÈCE</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#comment" className="transition-colors hover:text-foreground">Comment ça marche</a>
            <a href="#securite" className="transition-colors hover:text-foreground">Sécurité</a>
            <a href="#roles" className="transition-colors hover:text-foreground">Pour qui</a>
          </nav>
          <div className="flex items-center gap-2">
            {!isLoading && isAuthenticated ? (
              <Button asChild>
                <Link to="/accueil">Ouvrir l'app <ArrowRight className="size-4" /></Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/auth">Se connecter</Link>
                </Button>
                <Button asChild>
                  <Link to="/auth?mode=signup">Créer un compte</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero-band relative overflow-hidden text-white">
        <div className="hero-grid absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-5 gap-1.5 border-white/25 bg-white/10 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
              <Sparkles className="size-3.5 text-coin" />
              La plateforme des petits coups de main qui comptent
            </Badge>
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              Tes petits coups de main deviennent de{" "}
              <span className="bg-gradient-to-r from-coin via-[#FFE9B8] to-white bg-clip-text text-transparent">
                vraies opportunités
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/80">
              À LA PIÈCE met en relation des personnes qui ont besoin d'aide avec des adolescents
              prêts à rendre service — avec un cadre sécurisé, transparent et payé au juste prix.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="h-12 bg-white px-7 text-base text-primary shadow-lg hover:bg-white/90 hover:text-primary" asChild>
                <Link to="/auth?mode=signup&as=teen">
                  <GraduationCap className="size-4" /> Je suis ado — gagner de l'argent
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 border-white/40 bg-white/5 px-7 text-base text-white hover:bg-white/10 hover:text-white" asChild>
                <Link to="/auth?mode=signup&as=adult">
                  <UserRound className="size-4" /> Je cherche de l'aide
                </Link>
              </Button>
            </div>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs text-white/65">
              <ShieldCheck className="size-3.5" /> Missions filtrées par âge
              <span aria-hidden>·</span> Autorisation parentale intégrée
              <span aria-hidden>·</span> Paiement sécurisé Stripe
            </p>
          </div>

          {/* Demo mission cards */}
          <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-3">
            {DEMO_MISSIONS.map((m, i) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease: "easeOut" }}
              >
                <Card className="card-shadow h-full border-border/60 transition-transform hover:-translate-y-0.5">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
                        <m.icon className="size-5" />
                      </span>
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                        {m.price}
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-base font-bold">{m.title}</h3>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Timer className="size-3" /> {m.duration}</span>
                      <span aria-hidden>·</span>
                      <span className="flex items-center gap-0.5"><MapPin className="size-3" /> {m.zone}</span>
                    </p>
                    <span className={`mt-3 inline-block rounded-full px-2 py-1 text-[11px] font-semibold ${m.tagClass}`}>
                      {m.tag}
                    </span>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="comment" className="border-t bg-secondary/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Deux côtés, une seule promesse :<br className="hidden sm:block" /> la confiance
            </h2>
          </div>
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <div>
              <div className="mb-5 flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <GraduationCap className="size-5" />
                </span>
                <h3 className="font-display text-xl font-bold">Pour les adolescents</h3>
              </div>
              <div className="space-y-4">
                {TEEN_STEPS.map((s, i) => (
                  <div key={s.title} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {i + 1}
                      </span>
                      {i < TEEN_STEPS.length - 1 && <span className="mt-1 h-full w-px bg-border" />}
                    </div>
                    <div className="pb-2">
                      <p className="flex items-center gap-1.5 font-semibold"><s.icon className="size-4 text-primary" /> {s.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-5 flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-brand/10 text-brand">
                  <UserRound className="size-5" />
                </span>
                <h3 className="font-display text-xl font-bold">Pour les adultes</h3>
              </div>
              <div className="space-y-4">
                {ADULT_STEPS.map((s, i) => (
                  <div key={s.title} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">
                        {i + 1}
                      </span>
                      {i < ADULT_STEPS.length - 1 && <span className="mt-1 h-full w-px bg-border" />}
                    </div>
                    <div className="pb-2">
                      <p className="flex items-center gap-1.5 font-semibold"><s.icon className="size-4 text-brand" /> {s.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Safety */}
      <section id="securite" className="py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
          <div>
            <Badge variant="secondary" className="mb-4 gap-1.5">
              <ShieldCheck className="size-3.5 text-primary" /> Sécurité d'abord
            </Badge>
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Une mission n'est jamais « accessible à tous »
            </h2>
            <p className="mt-4 text-muted-foreground">
              Chaque mission passe par un moteur de restrictions qui croise l'âge, la catégorie,
              l'horaire, la durée et le niveau de risque. Impossible de contourner les règles —
              même pour une IA.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                { icon: CircleCheck, tone: "text-emerald-600 dark:text-emerald-400", text: "Autorisée — adaptée à ton âge et à ton profil" },
                { icon: CircleDot, tone: "text-amber-600 dark:text-amber-400", text: "Autorisation nécessaire — un responsable valide avant candidature" },
                { icon: Ban, tone: "text-rose-600 dark:text-rose-400", text: "Réservée aux majeurs — bloquée côté serveur, sans exception" },
                { icon: Lock, tone: "text-zinc-500", text: "Interdite — non publiée pour les mineurs" },
              ].map((rule) => (
                <li key={rule.text} className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 card-shadow">
                  <rule.icon className={`mt-0.5 size-4 shrink-0 ${rule.tone}`} />
                  <span>{rule.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: <ShieldCheck className="size-5" />, title: "Adresse protégée", text: "Jamais d'adresse exacte avant confirmation. Zone approximative seulement." },
              { icon: <BadgeCheck className="size-5" />, title: "Profils vérifiés", text: "Email vérifié obligatoire. Vérifications renforcées pour les adultes." },
              { icon: <Wallet className="size-5" />, title: "Paiement séquencé", text: "L'argent est sécurisé à la réservation, versé après la mission, remboursable." },
              { icon: <Search className="size-5" />, title: "Chat filtré", text: "Partage de téléphone, email ou adresse bloqué automatiquement dans le chat." },
            ].map((f) => (
              <Card key={f.title} className="card-shadow border-border/60">
                <CardContent className="p-5">
                  <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">{f.icon}</div>
                  <h4 className="mt-3 font-display font-bold">{f.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="border-t bg-secondary/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Une expérience pensée pour chaque rôle
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: GraduationCap, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", title: "Ados", text: "Missions adaptées à leur âge, XP, portefeuille, chat protégé." },
              { icon: UserRound, tone: "bg-brand/10 text-brand", title: "Adultes", text: "Publication en 2 minutes, candidatures qualifiées, paiement Stripe." },
              { icon: HeartHandshake, tone: "bg-primary/10 text-primary", title: "Parents", text: "Liaison avec le compte ado, validations d'autorisation, alertes SOS." },
              { icon: Laptop, tone: "bg-secondary text-secondary-foreground", title: "Organisations", text: "Architecture prête pour associations, commerces et entreprises." },
            ].map((r) => (
              <Card key={r.title} className="card-shadow border-border/60 text-center transition-transform hover:-translate-y-0.5">
                <CardContent className="p-6">
                  <span className={`mx-auto grid size-12 place-items-center rounded-2xl ${r.tone}`}>
                    <r.icon className="size-6" />
                  </span>
                  <h3 className="mt-3 font-display text-lg font-bold">{r.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Stats strip */}
          <div className="mt-14 grid gap-4 rounded-2xl border bg-card p-8 card-shadow sm:grid-cols-3">
            {[
              { value: "15–17", label: "tranche d'âge ado prioritaire" },
              { value: "3", label: "niveaux d'accès évalués par mission" },
              { value: "100 %", label: "des paiements passent par Stripe Checkout" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="font-display text-3xl font-extrabold text-primary">{s.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t py-20">
        <div className="hero-grid absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-2xl px-4 text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Prêt·e à rendre service — ou à être rendu·e ?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Crée ton compte en une minute. La première mission est souvent la plus gratifiante.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <Link to="/auth?mode=signup">Créer mon compte <ArrowRight className="size-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" asChild>
              <Link to="/missions">Explorer les missions</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="size-6 rounded" />
            <span className="font-display font-bold text-foreground">À LA PIÈCE</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><Star className="size-3.5 text-amber-500" /> La confiance d'abord</span>
            <Link to="/auth" className="hover:text-foreground">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
