import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MissionCard } from "@/components/mission-card";
import { eurosFromNumber, formatDateShort } from "@/lib/format";
import { ACCESS_META } from "@/convex/lib/safety";
import { APPLICATION_STATUS_META } from "@/lib/format";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight, CalendarCheck, FileText, Plus, ShieldCheck, Sparkles, Wallet,
} from "lucide-react";

function TeenHome() {
  const { user, profile } = useAuth();
  const stats = useQuery(api.stats.teenStats);
  const missions = useQuery(api.missions.listMissions, {});
  const apps = useQuery(api.missions.myApplications);

  const recommended = (missions ?? []).slice(0, 4);
  const pendingApps = (apps ?? []).filter((a) => a.application.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          Bonjour {profile?.firstName ?? "toi"} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">Prêt·e pour une nouvelle mission ?</p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <Wallet className="size-4" />, label: "Gagné", value: stats ? eurosFromNumber(stats.totalEarnedCents / 100) : "—" },
          { icon: <CalendarCheck className="size-4" />, label: "En cours", value: stats ? String(stats.bookingsActive) : "—" },
          { icon: <FileText className="size-4" />, label: "Candidatures", value: stats ? String(stats.applicationsTotal) : "—" },
          { icon: <Sparkles className="size-4" />, label: "Missions finies", value: stats ? String(stats.missionsCompleted) : "—" },
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

      {/* Pending applications */}
      {pendingApps.length > 0 && (
        <Card className="card-shadow border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{pendingApps.length} candidature{pendingApps.length > 1 ? "s" : ""} en attente</p>
              <p className="text-sm text-muted-foreground">
                Dernière : « {pendingApps[0].mission.title} » — on te prévient dès la réponse.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/candidatures">Voir</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">✨ Missions pour toi</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/missions">Tout voir <ArrowRight className="size-4" /></Link>
          </Button>
        </div>
        {!missions ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : recommended.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
              <span className="text-3xl">🌤️</span>
              <p className="font-semibold">Aucune mission publiée pour l'instant</p>
              <p className="text-sm text-muted-foreground">Reviens un peu plus tard — de nouvelles missions arrivent chaque jour.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {recommended.map((m: any) => <MissionCard key={m._id} mission={m} />)}
          </div>
        )}
      </section>

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

function AdultHome() {
  const { user, profile } = useAuth();
  const stats = useQuery(api.stats.adultStats);
  const missions = useQuery(api.missions.myMissions);
  const applications = useQuery(api.applications.listReceived);
  const paymentsState = useQuery(api.payments.isConfigured);

  const openMissions = (missions ?? []).filter((m: any) => m.status === "published");
  const pendingApps = (applications ?? []).filter((a) => a.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Bonjour {profile?.firstName ?? "toi"} 👋
          </h1>
          <p className="mt-1 text-muted-foreground">Voici ton activité en un coup d'œil.</p>
        </div>
        <Button size="lg" asChild>
          <Link to="/missions/create"><Plus className="size-4" /> Publier une mission</Link>
        </Button>
      </div>

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

      {pendingApps.length > 0 && (
        <Card className="card-shadow border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              📥 {pendingApps.length} candidature{pendingApps.length > 1 ? "s" : ""} à traiter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingApps.slice(0, 3).map((a: any) => (
              <div key={a._id} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-xl">{a.teen?.avatarEmoji ?? "🧑‍🎓"}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {a.teen?.firstName} → « {a.mission.title} »
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateShort(a.mission.scheduledDate)} · {eurosFromNumber(a.mission.priceEuros)}
                    </p>
                  </div>
                </div>
                <Badge className={APPLICATION_STATUS_META[a.status]?.className}>{APPLICATION_STATUS_META[a.status]?.label}</Badge>
              </div>
            ))}
            <Button variant="outline" size="sm" asChild>
              <Link to="/candidatures">Gérer les candidatures <ArrowRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!paymentsState?.configured && (
        <Card className="card-shadow border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div className="text-sm">
              <p className="font-semibold">💳 Paiement sécurisé à activer</p>
              <p className="mt-1 text-muted-foreground">
                Tu peux publier et recevoir des candidatures dès maintenant. Pour encaisser les réservations,
                connecte une clé Stripe (onglet Clés API) — les ados sont alors payés après chaque mission confirmée.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">📋 Tes missions ouvertes</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/mes-missions">Gérer</Link>
          </Button>
        </div>
        {!missions ? (
          <div className="grid gap-4 sm:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
        ) : openMissions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <span className="text-3xl">🚀</span>
              <p className="font-semibold">Publie ta première mission</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Décris ton besoin en quelques mots, choisis le prix — les adolescents du coin candidatent en général vite.
              </p>
              <Button asChild><Link to="/missions/create"><Plus className="size-4" /> Publier une mission</Link></Button>
            </CardContent>
          </Card>
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
