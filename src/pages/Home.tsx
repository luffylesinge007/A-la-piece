import { useAuth } from "@/hooks/use-auth";
import { useDemoSeed } from "@/hooks/use-demo-seed";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { CategorySlugIcon } from "@/components/icons";
import { MissionCard } from "@/components/mission-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { eurosFromNumber, formatDateShort, formatDateTime } from "@/lib/format";
import { APPLICATION_STATUS_META } from "@/lib/format";
import { Link } from "react-router";
import {
  ArrowRight, CalendarCheck, CircleCheck, FileText, Flame, Plus, ShieldCheck, Sparkles,
  Target, Trophy, Wallet, Zap, Users, Clock, Rocket, Search, Compass, Repeat, ShieldCheck as ShieldIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared contextual banner cards
// ---------------------------------------------------------------------------
function ActiveMissionCard({ booking }: { booking: any }) {
  const isTeen = booking.role === "teen";
  const statusLabel =
    booking.status === "in_progress" ? "En cours" : booking.status === "confirmed" ? "Confirmée — à venir" : "Paiement en attente";
  return (
    <Card className="card-shadow-lg border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-transparent">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CategorySlugIcon slug={booking.mission?.categorySlug} className="size-6" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              {statusLabel}
            </p>
            <p className="font-display text-lg font-extrabold leading-tight">{booking.mission?.title}</p>
            <p className="text-xs text-muted-foreground">
              {booking.mission ? `${formatDateShort(booking.mission.scheduledDate)} · ${booking.mission.scheduledTime}` : ""} · {eurosFromNumber(booking.priceEuros)}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link to={`/reservations/${booking._id}`}>Voir la mission <ArrowRight className="size-4" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ADOLESCENT HOME — discovery, money, XP
// ---------------------------------------------------------------------------
function TeenHome() {
  const { user, profile } = useAuth();
  useDemoSeed();
  const stats = useQuery(api.stats.teenStats);
  const missions = useQuery(api.missions.listMissions, {});
  const apps = useQuery(api.missions.myApplications);
  const bookings = useQuery(api.bookings.listMine);
  const goals = useQuery(api.wallet.myGoals);

  const recommended = (missions ?? [])
    .filter((m: any) => m.canApply || m.claimable)
    .slice(0, 4);
  const quickMissions = (missions ?? []).filter((m: any) => m.missionType === "quick" && m.claimable).slice(0, 2);
  const pendingApps = (apps ?? []).filter((a: any) => a.application.status === "pending");
  const acceptedApps = (apps ?? []).filter((a: any) => a.application.status === "accepted");
  const activeBooking = (bookings ?? []).find((b: any) => b.status === "in_progress" || b.status === "confirmed");
  const firstGoal = goals?.[0];
  const isNewUser = stats && stats.missionsCompleted === 0 && stats.applicationsTotal === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          Bonjour {profile?.firstName ?? "toi"}
        </h1>
        <p className="mt-1 text-muted-foreground">Prêt·e à gagner ta prochaine pièce ?</p>
      </div>

      {/* XP + level banner (gamified) */}
      {stats && (
        <Card className="card-shadow border-coin/50 bg-gradient-to-r from-coin/15 via-coin/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Trophy className="size-3.5 text-amber-500" /> Niveau {stats.level.number} — {stats.level.title}
                </p>
                <p className="mt-1 font-display text-2xl font-extrabold">{stats.xp} XP</p>
                {stats.level.next && (
                  <p className="text-xs text-muted-foreground">
                    Encore {stats.level.next.minXp - stats.xp} XP → {stats.level.next.title}
                  </p>
                )}
              </div>
              <div className="flex gap-4 text-center">
                <div>
                  <p className="flex items-center justify-center gap-1 font-display text-xl font-extrabold text-coin dark:text-coin"><Wallet className="size-4" /> {eurosFromNumber(stats.totalEarnedCents / 100)}</p>
                  <p className="text-[11px] text-muted-foreground">total gagné</p>
                </div>
                <div>
                  <p className="font-display text-xl font-extrabold">{stats.badges.length}</p>
                  <p className="text-[11px] text-muted-foreground">badges</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 font-display text-xl font-extrabold"><Zap className="size-4 text-amber-500" /> {stats.quickWins}</p>
                  <p className="text-[11px] text-muted-foreground">missions rapides</p>
                </div>
              </div>
            </div>
            <Progress value={stats.level.pct} className="mt-3 h-2" />
          </CardContent>
        </Card>
      )}

      {/* CONTEXTUAL: mission en cours */}
      {activeBooking && <ActiveMissionCard booking={activeBooking} />}

      {/* CONTEXTUAL: candidature acceptée */}
      {acceptedApps.length > 0 && !activeBooking && (
        <Card className="card-shadow border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Candidature acceptée !</p>
              <p className="text-sm text-muted-foreground">« {acceptedApps[0].mission.title} » — la suite t'attend dans tes réservations.</p>
            </div>
            <Button variant="outline" asChild><Link to="/reservations">Voir</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* CONTEXTUAL: candidatures en attente */}
      {pendingApps.length > 0 && (
        <Card className="card-shadow border-border/60">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-amber-500" /> {pendingApps.length} candidature{pendingApps.length > 1 ? "s" : ""} en attente</p>
              <p className="text-sm text-muted-foreground">Dernière : « {pendingApps[0].mission.title} » — réponse bientôt.</p>
            </div>
            <Button variant="outline" asChild><Link to="/candidatures">Suivre</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <Wallet className="size-4" />, label: "Cette semaine", value: stats ? eurosFromNumber(stats.weekCents / 100) : "—" },
          { icon: <CalendarCheck className="size-4" />, label: "En cours", value: stats ? String(stats.bookingsActive) : "—" },
          { icon: <FileText className="size-4" />, label: "Candidatures", value: stats ? String(stats.applicationsTotal) : "—" },
          { icon: <Trophy className="size-4" />, label: "Missions finies", value: stats ? String(stats.missionsCompleted) : "—" },
        ].map((s) => (
          <Card key={s.label} className="card-shadow border-border/60">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{s.icon}</span>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-extrabold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ⚡ Quick missions first — the most exciting flow */}
      {quickMissions.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Zap className="size-4 text-amber-500" /> Missions rapides — premier arrivé, premier servi</h2>
            <Button variant="ghost" size="sm" asChild><Link to="/missions">Tout voir</Link></Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {quickMissions.map((m: any) => <MissionCard key={m._id} mission={m} />)}
          </div>
        </section>
      )}

      {/* First-time onboarding card */}
      {isNewUser && (
        <Card className="card-shadow border-brand/30 bg-brand/5">
          <CardContent className="p-5">
            <p className="font-display text-lg font-bold">Bienvenue sur À LA PIÈCE</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Commence dès maintenant : explore les missions près de toi, candidate, et gagne tes premières pièces.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild><Link to="/missions"><Search className="size-4" /> Explorer les missions</Link></Button>
              <Button variant="outline" asChild><Link to="/portefeuille"><Target className="size-4" /> Fixer un objectif</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ✨ Recommended */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Flame className="size-4 text-primary" /> Missions près de toi</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/missions">Tout voir <ArrowRight className="size-4" /></Link>
          </Button>
        </div>
        {!missions ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : recommended.length === 0 ? (
          <EmptyState
            icon={<Compass className="size-7" />}
            title="Aucune mission disponible pour l'instant"
            description="De nouvelles missions sont publiées chaque jour. Reviens un peu plus tard — ou prépare ton profil pour être le premier à postuler !"
            actions={[{ label: "Compléter mon profil", to: "/profil", variant: "outline" }]}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {recommended.map((m: any) => <MissionCard key={m._id} mission={m} />)}
          </div>
        )}
      </section>

      {/* Savings goal teaser */}
      {firstGoal && (
        <Card className="card-shadow border-border/60">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-coin/15"><Target className="size-5 text-amber-600 dark:text-coin" /></span>
              <div>
                <p className="font-display font-bold">{firstGoal.label}</p>
                <p className="text-xs text-muted-foreground">
                  {eurosFromNumber(firstGoal.savedCents / 100)} / {eurosFromNumber(firstGoal.targetCents / 100)}
                  {firstGoal.savedCents < firstGoal.targetCents && (
                    <> · encore <strong>{eurosFromNumber((firstGoal.targetCents - firstGoal.savedCents) / 100)}</strong></>
                  )}
                </p>
              </div>
            </div>
            <div className="w-28"><Progress value={Math.min(100, (firstGoal.savedCents / firstGoal.targetCents) * 100)} /></div>
          </CardContent>
        </Card>
      )}

      <Card className="card-shadow border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
          <div className="text-sm">
            <p className="font-semibold">Rappel sécurité</p>
            <p className="text-muted-foreground">
              Ne partage jamais tes coordonnées dans le chat. L'adresse exacte n'est visible qu'après confirmation.
              Le bouton SOS reste accessible sur chaque page de mission.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADULT HOME — "De quoi avez-vous besoin ?", publishing, candidate management
// ---------------------------------------------------------------------------
function AdultHome() {
  const { user, profile } = useAuth();
  useDemoSeed();
  const stats = useQuery(api.stats.adultStats);
  const missions = useQuery(api.missions.myMissions);
  const applications = useQuery(api.applications.listReceived);
  const bookings = useQuery(api.bookings.listMine);
  const paymentsState = useQuery(api.payments.isConfigured);

  const openMissions = (missions ?? []).filter((m: any) => m.status === "published");
  const pendingApps = (applications ?? []).filter((a: any) => a.status === "pending");
  const activeBooking = (bookings ?? []).find((b: any) => b.status === "in_progress" || b.status === "confirmed");
  const isNewUser = stats && stats.missionsPublished === 0;
  const fullMissions = openMissions.filter((m: any) => m.appsFull);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Bonjour {profile?.firstName ?? "toi"}
          </h1>
          <p className="mt-1 text-muted-foreground">De quoi avez-vous besoin aujourd'hui ?</p>
        </div>
        <Button size="lg" className="h-12" asChild>
          <Link to="/missions/create"><Plus className="size-5" /> Publier une mission</Link>
        </Button>
      </div>

      {/* CONTEXTUAL: mission en cours */}
      {activeBooking && <ActiveMissionCard booking={activeBooking} />}

      {/* CONTEXTUAL: candidatures à traiter — the key adult decision */}
      {pendingApps.length > 0 && (
        <Card className="card-shadow border-brand/40 bg-brand/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Users className="size-6" /></span>
              <div>
                <p className="font-display text-lg font-extrabold">{pendingApps.length} candidat{pendingApps.length > 1 ? "s" : ""} à traiter</p>
                <p className="text-sm text-muted-foreground">Choisissez la personne qui vous convient le mieux.</p>
              </div>
            </div>
            <Button asChild><Link to="/candidatures">Voir les candidats <ArrowRight className="size-4" /></Link></Button>
          </CardContent>
        </Card>
      )}

      {/* CONTEXTUAL: missions vérifiées pleines → decision time */}
      {fullMissions.length > 0 && (
        <Card className="card-shadow border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="flex items-center gap-2 font-semibold"><CircleCheck className="size-4 text-emerald-500" /> {fullMissions.length} mission{fullMissions.length > 1 ? "s" : ""} avec candidatures complètes</p>
              <p className="text-sm text-muted-foreground">5 candidats vous attendent — comparez et sélectionnez.</p>
            </div>
            <Button variant="outline" asChild><Link to="/candidatures">Comparer</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Missions ouvertes", value: stats ? String(stats.missionsOpen) : "—" },
          { label: "Candidatures reçues", value: stats ? String(stats.applicationsReceived) : "—" },
          { label: "Réservations actives", value: stats ? String(stats.bookingsActive) : "—" },
          { label: "Dépensé ce mois-ci", value: stats ? eurosFromNumber(stats.spentThisMonthEuros) : "—" },
        ].map((s) => (
          <Card key={s.label} className="card-shadow border-border/60">
            <CardContent className="p-4">
              <p className="font-display text-xl font-extrabold">{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick creation shortcuts */}
      {isNewUser && (
        <Card className="card-shadow border-brand/30 bg-brand/5">
          <CardContent className="p-5">
            <p className="font-display text-lg font-bold">Bienvenue sur À LA PIÈCE</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Créez votre première mission en 2 minutes : décrivez votre besoin, choisissez Rapide ou Vérifiée, publiez.
            </p>
            <Button className="mt-3" asChild><Link to="/missions/create"><Plus className="size-4" /> Créer ma première mission</Link></Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Zap, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400", title: "Mission rapide", desc: "Prise au premier clic par un ado disponible.", to: "/missions/create" },
          { icon: ShieldIcon, tone: "bg-brand/10 text-brand", title: "Mission vérifiée", desc: "5 candidats, vous comparez, vous choisissez.", to: "/missions/create" },
          { icon: Repeat, tone: "bg-secondary text-secondary-foreground", title: "Récurrente (bientôt)", desc: "Chaque semaine, la même aide de confiance.", to: "/missions/create" },
        ].map((q) => (
          <Link key={q.title} to={q.to} className="group">
            <Card className="card-shadow h-full border-border/60 transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
              <CardContent className="p-4">
                <span className={`grid size-10 place-items-center rounded-xl ${q.tone}`}><q.icon className="size-5" /></span>
                <p className="mt-1.5 font-display font-bold">{q.title}</p>
                <p className="text-xs text-muted-foreground">{q.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!paymentsState?.configured && (
        <Card className="card-shadow border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div className="text-sm">
              <p className="flex items-center gap-2 font-semibold"><CircleCheck className="size-4 text-emerald-500" /> Paiement sécurisé à activer</p>
              <p className="mt-1 text-muted-foreground">
                Vous pouvez publier et recevoir des candidatures dès maintenant. Pour encaisser les réservations,
                connectez une clé Stripe (onglet Clés API) — les ados sont alors payés après chaque mission confirmée.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><FileText className="size-4" /> Vos missions ouvertes</h2>
          <Button variant="ghost" size="sm" asChild><Link to="/mes-missions">Gérer</Link></Button>
        </div>
        {!missions ? (
          <div className="grid gap-4 sm:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
        ) : openMissions.length === 0 ? (
          <EmptyState
            icon={<Rocket className="size-7" />}
            title="Aucune mission publiée"
            description="Décrivez votre besoin en quelques mots, choisissez le prix — les adolescents du coin candidatent en général très vite."
            actions={[{ label: "Publier une mission", to: "/missions/create" }]}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {openMissions.slice(0, 4).map((m: any) => <MissionCard key={m._id} mission={m} mine />)}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  return <AppShell>{user?.accountType === "teen" ? <TeenHome /> : <AdultHome />}</AppShell>;
}
