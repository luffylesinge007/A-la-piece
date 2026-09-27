import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError, formatDateTime } from "@/lib/format";
import { BadgeCheck, ExternalLink, FileVideo, IdCard, Lock, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const KIND_LABEL: Record<string, string> = {
  id_card: "Carte d'identité",
  passport: "Passeport",
  driver_license: "Permis de conduire",
  video: "Reconnaissance visuelle",
};

export default function AdminVerifications() {
  const { user } = useAuth();
  const isStaff = user?.accountType === "admin" || user?.accountType === "moderator";
  const queue = useQuery(api.identity.reviewQueue, isStaff ? {} : "skip");

  const approve = useMutation(api.identity.approve);
  const reject = useMutation(api.identity.reject);

  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isStaff) {
    return (
      <AppShell>
        <EmptyState
          icon={<Lock className="size-7" />}
          title="Espace modération"
          description="Cette page est réservée aux administrateurs et modérateurs."
          actions={[{ label: "Retour à l'accueil", to: "/accueil" }]}
        />
      </AppShell>
    );
  }

  const handleApprove = async (verificationId: string) => {
    setBusy(true);
    try {
      await approve({ verificationId: verificationId as any });
      toast.success("Document approuvé — décharge parentale activée.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectOpen || !rejectReason.trim()) return;
    setBusy(true);
    try {
      await reject({ verificationId: rejectOpen as any, reason: rejectReason.trim() });
      toast.success("Document refusé — le responsable est notifié.");
      setRejectOpen(null);
      setRejectReason("");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
            <ShieldCheck className="size-6 text-primary" /> Vérifications d'identité
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Documents soumis par les responsables pour activer une décharge parentale. Vérifie la
            lisibilité et la cohérence, puis approuve ou refuse.
          </p>
        </div>

        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">
              File d'attente ({queue?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!queue ? (
              <p className="py-3 text-sm text-muted-foreground">Chargement…</p>
            ) : queue.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Aucun document en attente. Les nouvelles soumissions apparaissent ici.
              </p>
            ) : (
              queue.map((row) => (
                <div key={row._id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        {row.kind === "video" ? <FileVideo className="size-5" /> : <IdCard className="size-5" />}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {KIND_LABEL[row.kind] ?? row.kind}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Soumis par {row.submitter}
                          {row.teenName ? ` — décharge pour ${row.teenName}` : ""} ·{" "}
                          {formatDateTime(row.submittedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ReviewLink verificationId={row._id} />
                      <Button
                        size="sm"
                        onClick={() => handleApprove(row._id)}
                        disabled={busy}
                      >
                        <BadgeCheck className="size-4" /> Approuver
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectOpen(row._id)}
                        disabled={busy}
                      >
                        <X className="size-4" /> Refuser
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Reject dialog */}
        <Dialog open={!!rejectOpen} onOpenChange={(open) => !open && setRejectOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refuser le document</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Motif (visible par le responsable)</Label>
              <Input
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Photo illisible — renvoie un document net"
                maxLength={200}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRejectOpen(null)}>Annuler</Button>
              <Button variant="destructive" onClick={handleReject} disabled={busy || !rejectReason.trim()}>
                Confirmer le refus
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

/** Opens the document in a new tab via the reviewer-only short-lived URL. */
function ReviewLink({ verificationId }: { verificationId: string }) {
  const url = useQuery(api.identity.reviewFileUrl, { verificationId: verificationId as any });
  if (!url) {
    return (
      <Button size="sm" variant="outline" disabled>
        <ExternalLink className="size-4" /> Document…
      </Button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <Button size="sm" variant="outline">
        <ExternalLink className="size-4" /> Voir le document
      </Button>
    </a>
  );
}
