import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ACCESS_META } from "@/convex/lib/safety";
import { eurosFromNumber, formatDateShort, formatDuration, friendlyError, APPLICATION_STATUS_META } from "@/lib/format";
import { useMutation } from "convex/react";
import { Clock, MapPin, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

interface MissionData {
  _id: Id<"missions">;
  title: string;
  categorySlug: string;
  category?: { emoji: string; label: string } | null;
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

export function MissionCard({ mission, mine }: { mission: MissionData; mine?: boolean }) {
  const { user, hasApprovedParent } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const apply = useMutation(api.applications.apply);

  const cat = mission.category;
  const isTeen = user?.accountType === "teen";

  const handleApply = async () => {
    setSending(true);
    try {
      await apply({ missionId: mission._id, message: message.trim() || undefined });
      toast.success("Candidature envoyée 🎉 On te prévient dès la réponse !");
      setOpen(false);
      setMessage("");
      navigate("/candidatures");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="card-shadow group border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-secondary text-xl">
              {cat?.emoji ?? "📌"}
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
          <span className="flex items-center gap-1">📅 {formatDateShort(mission.scheduledDate)} · {mission.scheduledTime}</span>
          <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {mission.area}, {mission.city}</span>
          {mission.applicantCount !== undefined && mission.applicantCount > 0 && (
            <span className="flex items-center gap-1"><Users className="size-3.5" /> {mission.applicantCount}</span>
          )}
        </p>

        <div className="mt-3 flex flex-1 flex-wrap items-center gap-2">
          <AccessBadge level={mission.access.level} />
          {mine && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">Ta mission</span>}
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link to={`/missions/${mission._id}`}>Détails</Link>
          </Button>
          {!mine && isTeen && mission.canApply && (
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
          {mine && (
            <Button variant="secondary" size="sm" className="flex-1" asChild>
              <Link to="/candidatures">Candidatures reçues</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
