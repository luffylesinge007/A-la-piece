import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ACCESS_META } from "@/convex/lib/safety";
import { CategoryIcon } from "@/components/icons";
import { eurosFromNumber, formatDateShort, formatDuration, friendlyError } from "@/lib/format";
import { useMutation } from "convex/react";
import { CalendarDays, Clock, MapPin, ShieldCheck, Users, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MissionData {
  _id: Id<"missions">;
  title: string;
  categorySlug: string;
  category?: { icon: string; label: string } | null;
  priceEuros: number;
  durationMin: number;
  scheduledDate: string;
  scheduledTime: string;
  area: string;
  city: string;
  status: string;
  access: { level: keyof typeof ACCESS_META };
  canApply?: boolean;
  isMine?: boolean;
  applicantCount?: number;
  missionType?: "quick" | "verified";
  maxApplicants?: number;
  appsFull?: boolean;
  claimable?: boolean;
}

export function AccessBadge({ level }: { level: keyof typeof ACCESS_META }) {
  const meta = ACCESS_META[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.color}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/** Zap (rapide) / Shield (vérifiée) mission-type chip. */
export function MissionTypeBadge({ type, className }: { type?: "quick" | "verified"; className?: string }) {
  if (type === "quick") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400", className)}>
        <Zap className="size-3" /> Mission rapide
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand dark:text-coin", className)}>
      <ShieldCheck className="size-3" /> Mission vérifiée
    </span>
  );
}

export function MissionCard({ mission, mine }: { mission: MissionData; mine?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const apply = useMutation(api.applications.apply);
  const claim = useMutation(api.applications.claimQuick);

  const cat = mission.category;
  const isTeen = user?.accountType === "teen";
  const isQuick = mission.missionType === "quick";
  const type = mission.missionType ?? "verified";

  const handleApply = async () => {
    setSending(true);
    try {
      await apply({ missionId: mission._id, message: message.trim() || undefined });
      toast.success("Candidature envoyée — on te prévient dès la réponse !");
      setOpen(false);
      setMessage("");
      navigate("/candidatures");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSending(false);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await claim({ missionId: mission._id });
      toast.success("Mission prise ! Elle est à toi.");
      navigate("/reservations");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Card className="card-shadow group border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
              <CategoryIcon category={cat} className="size-5" />
            </span>
            <div>
              <h3 className="font-display leading-tight font-bold">{mission.title}</h3>
              <p className="text-xs text-muted-foreground">{cat?.label}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 font-display text-sm font-extrabold text-primary">
            {eurosFromNumber(mission.priceEuros)}
          </span>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="size-3.5" /> {formatDuration(mission.durationMin)}</span>
          <span className="flex items-center gap-1"><CalendarDays className="size-3.5" /> {formatDateShort(mission.scheduledDate)} · {mission.scheduledTime}</span>
          <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {mission.area}, {mission.city}</span>
          {mission.applicantCount !== undefined && mission.applicantCount > 0 && (
            <span className="flex items-center gap-1"><Users className="size-3.5" /> {mission.applicantCount}{mission.maxApplicants ? `/${mission.maxApplicants}` : ""}</span>
          )}
        </p>

        <div className="mt-3 flex flex-1 flex-wrap items-center gap-2">
          <MissionTypeBadge type={type} />
          <AccessBadge level={mission.access.level} />
          {mine && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">Ta mission</span>}
          {mine && isQuick && mission.status === "assigned" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Zap className="size-3" /> Mission prise !
            </span>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link to={`/missions/${mission._id}`}>Détails</Link>
          </Button>
          {!mine && isTeen && isQuick && mission.claimable && (
            <Button size="sm" className="flex-1" onClick={handleClaim} disabled={claiming}>
              <Zap className="size-4" /> {claiming ? "…" : "Je prends"}
            </Button>
          )}
          {!mine && isTeen && isQuick && !mission.claimable && mission.status === "assigned" && (
            <Button size="sm" variant="secondary" className="flex-1" disabled>
              Mission prise
            </Button>
          )}
          {!mine && isTeen && !isQuick && mission.canApply && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button size="sm" className="flex-1">Candidater</Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle className="font-display">Candidater — {mission.title}</SheetTitle>
                  <SheetDescription>
                    {eurosFromNumber(mission.priceEuros)} · {formatDuration(mission.durationMin)} ·{" "}
                    {formatDateShort(mission.scheduledDate)} à {mission.scheduledTime}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-3 px-4 pb-6">
                  <p className="text-sm text-muted-foreground">
                    Pourquoi souhaitez-vous réaliser cette mission ? <span className="text-xs">(facultatif)</span>
                  </p>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ex : j'adore les animaux et j'ai déjà promené le chien de mes voisins."
                    rows={3}
                    maxLength={500}
                  />
                  <Button className="w-full" size="lg" onClick={handleApply} disabled={sending}>
                    {sending ? "Envoi…" : "Envoyer ma candidature"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    L'adulte verra ton prénom, ta ville, tes compétences et ton statut de vérification.
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          )}
          {!mine && isTeen && !isQuick && mission.appsFull && (
            <Button size="sm" variant="secondary" className="flex-1" disabled>
              Complet
            </Button>
          )}
          {mine && (
            <Button variant="secondary" size="sm" className="flex-1" asChild>
              <Link to="/candidatures">{isQuick && mission.status === "assigned" ? "Voir la réservation" : "Candidatures reçues"}</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
