import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { MissionTypeBadge } from "@/components/mission-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { APPLICATION_STATUS_META, eurosFromNumber, formatDateShort, friendlyError, formatDuration } from "@/lib/format";
import { BadgeCheck, Check, Clock, MapPin, Star, Trophy, X, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

function AdultApplications() {
  const navigate = useNavigate();
  const applications = useQuery(api.applications.listReceived);
  const missions = useQuery(api.missions.myMissions);
  const accept = useMutation(api.applications.accept);
  const decline = useMutation(api.applications.decline);
  const [busy, setBusy] = useState<string | null>(null);

  const handleAccept = async (id: string) => {
    setBusy(id);
    try {
      const bookingId = await accept({ applicationId: id as any });
      toast.success("Candidature acceptée 🎉 Finalisez avec le paiement sécurisé.");
      navigate(`/reservations/${bookingId}`);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async (id: string) => {
    setBusy(id);
    try {
      await decline({ applicationId: id as any });
      toast.success("Candidature refusée. L'adolescent en sera notifié.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  if (applications === undefined) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    );
  }

  const missionTypeOf = (missionId: string) =>
    missions?.find((m: any) => m._id === missionId)?.missionType ?? "verified";

  const pending = applications.filter((a: any) => a.status === "pending");
  const processed = applications.filter((a: any) => a.status !== "pending");

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-3 font-display text-lg font-bold">⏳ À traiter ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState
            emoji="📭"
            title="Aucune candidature en attente"
            description="Publiez une mission pour recevoir vos premières candidatures — les 5 premiers intéressés peuvent postuler sur chaque mission vérifiée."
            actions={[{ label: "Publier une mission", to: "/missions/create" }]}
          />
        ) : (
          <div className="space-y-3">
            {pending.map((a: any) => (
              <Card key={a._id} className="card-shadow border-border/60">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-2xl">
                      {a.teen?.avatarEmoji ?? "🧑‍🎓"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display font-bold">{a.teen?.firstName}</p>
                        {a.teen?.verifiedEmail && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <BadgeCheck className="size-3.5" /> vérifié
                          </span>
                        )}
                        {/* Gamified trust row */}
                        <span className="flex items-center gap-1 rounded-full bg-coin/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-coin">
                          <Trophy className="size-3" /> Niv. {a.teen?.level ?? 1}
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">
                          <Star className="size-3 text-amber-500" /> {a.teen?.averageRating ?? "—"}/5 ({a.teen?.reviewCount ?? 0})
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">
                          {a.teen?.missionsDone ?? 0} missions
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.teen?.city} {a.teen?.availability?.length ? `· dispo : ${a.teen.availability.slice(0, 3).join(", ")}` : ""}
                      </p>
                      <p className="mt-2 text-sm">
                        <span className="font-semibold">« {a.mission.title} »</span>
                        <span className="text-muted-foreground">
                          {" "}· {eurosFromNumber(a.mission.priceEuros)} · {formatDateShort(a.mission.scheduledDate)} · {formatDuration(a.mission.durationMin ?? 0)}
                        </span>
                      </p>
                      {a.message && (
                        <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-sm italic text-secondary-foreground">
                          « {a.message} »
                        </p>
                      )}
                      {a.teen?.skills?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.teen.skills.slice(0, 5).map((s: string) => (
                            <Badge key={s} variant="outline" className="text-[11px]">{s}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => handleAccept(a._id)} disabled={busy === a._id}>
                      <Check className="size-4" /> Sélectionner
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDecline(a._id)} disabled={busy === a._id}>
                      <X className="size-4" /> Refuser
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/missions/${a.mission._id}`}>Voir la mission</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {processed.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold">Historique</h2>
          <div className="space-y-2">
            {processed.map((a: any) => (
              <Card key={a._id} className="border-border/60">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.teen?.firstName} · « {a.mission.title} »
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(a.mission.scheduledDate)}</p>
                  </div>
                  <Badge variant="secondary" className={APPLICATION_STATUS_META[a.status]?.className}>
                    {APPLICATION_STATUS_META[a.status]?.label}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TeenApplications() {
  const apps = useQuery(api.missions.myApplications);
  const withdraw = useMutation(api.applications.withdraw);
  const [busy, setBusy] = useState<string | null>(null);

  if (apps === undefined) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <EmptyState
        emoji="🌱"
        title="Aucune candidature pour l'instant"
        description="Explore les missions ouvertes et candidate : la première réponse arrive souvent vite ! Les missions rapides ⚡ sont prises au premier clic."
        actions={[{ label: "Explorer les missions", to: "/missions" }]}
      />
    );
  }

  const handleWithdraw = async (id: string) => {
    setBusy(id);
    try {
      await withdraw({ applicationId: id as any });
      toast.success("Candidature retirée.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {apps.map((a: any) => (
        <Card key={a.application._id} className="card-shadow border-border/60">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <span className="grid size-11 place-items-center rounded-xl bg-secondary text-xl">
              {a.mission.category?.emoji ?? "📌"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{a.mission.title}</p>
                <MissionTypeBadge type={a.mission.missionType} />
                <Badge variant="secondary" className={APPLICATION_STATUS_META[a.application.status]?.className}>
                  {APPLICATION_STATUS_META[a.application.status]?.label}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {eurosFromNumber(a.mission.priceEuros)} · {formatDateShort(a.mission.scheduledDate)} · {a.mission.area}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to={`/missions/${a.mission._id}`}>Voir</Link>
              </Button>
              {a.application.status === "pending" && (
                <Button size="sm" variant="ghost" onClick={() => handleWithdraw(a.application._id)} disabled={busy === a.application._id}>
                  Retirer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Applications() {
  const { user } = useAuth();
  const isTeen = user?.accountType === "teen";

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {isTeen ? "Mes candidatures" : "Candidatures reçues"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeen
              ? "Suis l'état de chaque candidature envoyée."
              : "Comparez les profils : niveau, note, missions réalisées, compétences — puis sélectionnez."}
          </p>
        </div>
        {isTeen ? <TeenApplications /> : <AdultApplications />}
      </div>
    </AppShell>
  );
}
