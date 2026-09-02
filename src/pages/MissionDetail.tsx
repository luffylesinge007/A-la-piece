import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { AccessBadge } from "@/components/mission-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCESS_META, getCategory } from "@/convex/lib/safety";
import { eurosFromNumber, formatDate, formatDuration, friendlyError } from "@/lib/format";
import {
  ArrowLeft, BadgeCheck, Ban, Clock, Lock, MapPin, Send, ShieldCheck, TriangleAlert, Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

const FALLBACK_CATEGORY = { emoji: "📌", label: "Mission" };

export default function MissionDetail() {
  const { id } = useParams();
  const { user, hasApprovedParent } = useAuth();
  const navigate = useNavigate();
  const mission = useQuery(
    api.missions.getMission,
    id ? { missionId: id as any } : "skip",
  );
  const [message, setMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const apply = useMutation(api.applications.apply);
  const cancelMission = useMutation(api.missions.cancelMission);

  if (mission === undefined) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (mission === null) {
    return (
      <AppShell>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="text-4xl">🫥</span>
            <p className="font-display text-lg font-bold">Mission introuvable</p>
            <p className="text-sm text-muted-foreground">Elle a peut-être été retirée ou terminée.</p>
            <Button asChild><Link to="/missions">Retour aux missions</Link></Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const cat = mission.category ?? FALLBACK_CATEGORY;
  const isTeen = user?.accountType === "teen";
  const accessMeta = ACCESS_META[mission.access.level];
  const alreadyApplied = mission.myApplicationStatus && mission.myApplicationStatus !== "withdrawn";

  const handleApply = async () => {
    setApplying(true);
    try {
      await apply({ missionId: mission._id, message: message.trim() || undefined });
      toast.success("Candidature envoyée 🎉");
      setSheetOpen(false);
      setMessage("");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelMission({ missionId: mission._id });
      toast.success("Mission annulée.");
      navigate("/mes-missions");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/missions"><ArrowLeft className="size-4" /> Retour</Link>
        </Button>

        {/* Header card */}
        <Card className="card-shadow-lg border-border/60">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-secondary text-3xl">{cat.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{cat.label}</Badge>
                  {mission.status !== "published" && <Badge variant="outline">{mission.status}</Badge>}
                </div>
                <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight">{mission.title}</h1>
              </div>
              <div className="text-right">
                <p className="font-display text-3xl font-extrabold text-primary">{eurosFromNumber(mission.priceEuros)}</p>
                <p className="text-xs text-muted-foreground">pour la mission</p>
              </div>
            </div>

            <Separator className="my-5" />

            <div className="grid gap-4 text-sm sm:grid-cols-2">
              {[
                { icon: <Clock className="size-4" />, label: "Durée", value: formatDuration(mission.durationMin) },
                { icon: <span>📅</span>, label: "Date", value: formatDate(mission.scheduledDate) },
                { icon: <span>🕙</span>, label: "Heure", value: mission.scheduledTime },
                { icon: <MapPin className="size-4" />, label: "Zone", value: `${mission.area}, ${mission.city}` },
                ...(mission.teamSize ? [{ icon: <Users className="size-4" />, label: "Équipe", value: `${mission.teamSize} personnes` }] : []),
                ...(mission.requiresPin ? [{ icon: <Lock className="size-4" />, label: "Code PIN", value: "Requis au démarrage" }] : []),
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground">{row.icon}</span>
                  <div>
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className="font-medium">{row.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-5" />

            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-display font-bold">Description</h3>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">{mission.description}</p>
              </div>
              {mission.requiredSkills?.length > 0 && (
                <div>
                  <h3 className="font-display font-bold">Compétences nécessaires</h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {mission.requiredSkills.map((s: string) => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {mission.equipment && (
                <div>
                  <h3 className="font-display font-bold">Matériel</h3>
                  <p className="mt-1 text-muted-foreground">{mission.equipment}</p>
                </div>
              )}
              {mission.safetyNotes && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
                  <p className="flex items-center gap-2 font-semibold text-sky-700 dark:text-sky-400">
                    <ShieldCheck className="size-4" /> Informations de sécurité
                  </p>
                  <p className="mt-1 text-muted-foreground">{mission.safetyNotes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Safety access panel */}
        <Card className={`card-shadow border-border/60 ${mission.access.level === "allowed" ? "bg-emerald-500/5" : mission.access.level === "parental_approval" ? "bg-amber-500/5" : "bg-rose-500/5"}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`grid size-10 place-items-center rounded-xl ${accessMeta.color}`}>
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="font-display font-bold">Accès à cette mission</p>
                  <AccessBadge level={mission.access.level} />
                </div>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {mission.access.reasons.map((r: string) => <li key={r}>• {r}</li>)}
            </ul>
            {mission.access.level === "parental_approval" && !hasApprovedParent && isTeen && (
              <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
                💡 Ajoute un responsable légal depuis la page <Link to="/securite" className="font-semibold underline">Sécurité</Link>{" "}
                pour débloquer les missions 🟡.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Address */}
        <Card className="card-shadow border-border/60">
          <CardContent className="flex items-center gap-3 p-5">
            {mission.showExactAddress && mission.exactAddress ? (
              <>
                <MapPin className="size-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Adresse précise</p>
                  <p className="font-medium">{mission.exactAddress}</p>
                </div>
              </>
            ) : (
              <>
                <Lock className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">Adresse protégée</p>
                  <p className="text-sm text-muted-foreground">
                    Zone approximative : {mission.area}, {mission.city}. L'adresse exacte est dévoilée après confirmation de la réservation.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Publisher */}
        {mission.publisher && (
          <Card className="card-shadow border-border/60">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid size-12 place-items-center rounded-full bg-secondary text-2xl">
                {mission.publisher.avatarEmoji ?? "👤"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold">{mission.publisher.firstName}</p>
                <p className="text-xs text-muted-foreground">{mission.publisher.city}</p>
              </div>
              <div className="flex gap-1.5">
                {mission.publisher.verifiedEmail && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck className="size-3.5" /> Email vérifié
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CTA */}
        {mission.isMine ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" asChild>
              <Link to="/candidatures">Voir les candidatures ({mission.applicantCount})</Link>
            </Button>
            {(mission.status === "published" || mission.status === "assigned") && (
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                <Ban className="size-4" /> Annuler la mission
              </Button>
            )}
          </div>
        ) : isTeen ? (
          alreadyApplied ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <p className="text-sm"><strong>Candidature envoyée</strong> — statut : {mission.myApplicationStatus === "accepted" ? "acceptée ✅" : "en attente ⏳"}</p>
                <Button variant="outline" size="sm" asChild><Link to="/candidatures">Suivre</Link></Button>
              </CardContent>
            </Card>
          ) : mission.access.level === "adults_only" || mission.access.level === "forbidden" ? (
            <Card className="border-rose-500/30 bg-rose-500/5">
              <CardContent className="flex items-center gap-3 p-4">
                <TriangleAlert className="size-5 shrink-0 text-rose-500" />
                <p className="text-sm">
                  Cette mission est réservée aux utilisateurs majeurs. Elle n'est pas accessible depuis ton compte.
                </p>
              </CardContent>
            </Card>
          ) : mission.access.level === "parental_approval" && !hasApprovedParent ? (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="flex items-center gap-3 p-4">
                <TriangleAlert className="size-5 shrink-0 text-amber-500" />
                <p className="text-sm">
                  Autorisation parentale requise avant de candidater. Ajoute un responsable depuis la page Sécurité.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button size="lg" className="w-full h-12 text-base">CANDIDATER</Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle className="font-display">Candidater — {mission.title}</SheetTitle>
                  <SheetDescription>
                    {eurosFromNumber(mission.priceEuros)} · {formatDuration(mission.durationMin)} · {formatDate(mission.scheduledDate)}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-3 px-4 pb-6">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Pourquoi souhaitez-vous réaliser cette mission ? (facultatif)"
                    rows={3}
                    maxLength={500}
                  />
                  <Button className="w-full" size="lg" onClick={handleApply} disabled={applying}>
                    {applying ? "Envoi…" : <><Send className="size-4" /> Candidater</>}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )
        ) : !user ? (
          <Button size="lg" className="w-full" asChild>
            <Link to={`/auth?returnTo=/missions/${mission._id}`}>Se connecter pour candidater</Link>
          </Button>
        ) : null}
      </div>
    </AppShell>
  );
}
