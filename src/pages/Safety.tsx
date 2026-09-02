import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError, formatDateTime } from "@/lib/format";
import { Check, HeartHandshake, Link2, PhoneCall, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Safety() {
  const { user, hasApprovedParent } = useAuth();
  const safetyEvents = useQuery(api.safety.mySafetyEvents);
  const family = useQuery(api.safety.familyView, user?.accountType === "parent" ? {} : "skip");

  const linkParent = useMutation(api.profiles.linkParent);
  const respondParentLink = useMutation(api.profiles.respondParentLink);
  const submitReport = useMutation(api.safety.submitReport);
  const triggerSOS = useMutation(api.safety.triggerSOS);

  const [parentEmail, setParentEmail] = useState("");
  const [linking, setLinking] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [sosOpen, setSosOpen] = useState(false);
  const [sosKind, setSosKind] = useState("other");
  const [sosDetails, setSosDetails] = useState("");

  const isTeen = user?.accountType === "teen";
  const isParent = user?.accountType === "parent";

  const handleLink = async () => {
    if (!parentEmail.trim()) return;
    setLinking(true);
    try {
      await linkParent({ parentEmail: parentEmail.trim() });
      toast.success("Demande envoyée à ton responsable ✅");
      setParentEmail("");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setLinking(false);
    }
  };

  const handleRespond = async (linkId: any, accept: boolean) => {
    try {
      await respondParentLink({ linkId, accept });
      toast.success(accept ? "Liaison validée ✅" : "Demande refusée.");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const handleReport = async () => {
    if (!reportReason.trim()) return;
    try {
      await submitReport({ targetType: "user", targetId: "general", reason: reportReason.trim() });
      toast.success("Signalement transmis. Merci de nous aider à garder la plateforme sûre.");
      setReportOpen(false);
      setReportReason("");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const handleSOS = async () => {
    try {
      const result: any = await triggerSOS({ kind: sosKind as any, details: sosDetails.trim() || undefined });
      toast.error(result?.message ?? "Alerte enregistrée.", { duration: 8000 });
      setSosOpen(false);
      setSosDetails("");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">🛡️ Sécurité</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SOS, signalements, contacts de confiance et confidentialité — au même endroit.
          </p>
        </div>

        {/* Emergency */}
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="space-y-3 p-5">
            <p className="font-display text-lg font-bold text-rose-600 dark:text-rose-400">Besoin d'aide maintenant ?</p>
            <p className="text-sm text-muted-foreground">
              En cas de danger immédiat, appelle le <strong>112</strong> (ou le 17 pour la police).
              Pour un problème pendant une mission, déclenche une alerte : tes contacts de confiance
              et notre équipe seront notifiés dans l'application.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="tel:112">
                <Button variant="destructive"><PhoneCall className="size-4" /> Appeler le 112</Button>
              </a>
              <Button variant="outline" onClick={() => setSosOpen(true)}>🚨 Déclencher une alerte SOS</Button>
              <Button variant="ghost" onClick={() => setReportOpen(true)}>Signaler un contenu</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ℹ️ L'appel d'urgence passe par le téléphone : l'application ne remplace pas les secours.
            </p>
          </CardContent>
        </Card>

        {/* Teen: parent link */}
        {isTeen && (
          <Card className="card-shadow border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Link2 className="size-4" /> Contact de confiance (parent / responsable)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {hasApprovedParent ? (
                <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <Check className="size-4" /> Ton responsable est validé : il peut autoriser les missions 🟡 et reçoit tes alertes.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Ajoute un responsable légal : certaines missions (🟡) nécessitent son autorisation.
                    Il reçoit aussi tes alertes SOS.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      placeholder="Email du compte Parent"
                    />
                    <Button onClick={handleLink} disabled={linking || !parentEmail.trim()}>Inviter</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Parent: family management */}
        {isParent && family && (
          <Card className="card-shadow border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <HeartHandshake className="size-4" /> Famille
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {family.pendingLinks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Demandes en attente</p>
                  {family.pendingLinks.map((l: any) => (
                    <div key={l._id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <p className="text-sm">{l.teenEmoji} <strong>{l.teenName}</strong> veut te désigner comme responsable.</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleRespond(l._id, true)}><Check className="size-4" /> Accepter</Button>
                        <Button size="sm" variant="outline" onClick={() => handleRespond(l._id, false)}><X className="size-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {family.teens.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Ados suivis</p>
                  {family.teens.map((t: any) => (
                    <div key={t._id} className="flex items-center gap-3 rounded-lg border p-3">
                      <span className="text-xl">{t.teenEmoji}</span>
                      <p className="flex-1 text-sm font-medium">{t.teenName}</p>
                      <Badge variant="secondary">Suivi actif</Badge>
                    </div>
                  ))}
                </div>
              ) : family.pendingLinks.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Aucun ado lié pour l'instant. Ton adolescent doit t'inviter depuis son compte (page Sécurité).
                </p>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Safety timeline */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Journal de sécurité</CardTitle>
          </CardHeader>
          <CardContent>
            {!safetyEvents ? (
              <p className="py-3 text-sm text-muted-foreground">Chargement…</p>
            ) : safetyEvents.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Aucun événement — c'est une bonne nouvelle ✅ Les check-in/out et alertes apparaîtront ici.
              </p>
            ) : (
              <div className="space-y-2">
                {safetyEvents.map((e: any) => (
                  <div key={e._id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                    <span>
                      {e.type === "sos" ? "🚨" : e.type === "check_in" ? "▶" : "✅"} {e.details ?? e.type}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Privacy notes */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <ShieldCheck className="size-4" /> Confidentialité par défaut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Ton adresse exacte, ton téléphone et ton email ne sont jamais visibles publiquement.</p>
            <p>• La zone de mission est approximative ; l'adresse précise n'est dévoilée qu'après confirmation.</p>
            <p>• Le partage de coordonnées est bloqué dans le chat, pour tout le monde.</p>
            {isTeen && <p>• Compte mineur : profil privé, position masquée et messages restreints, sans possibilité de déverrouillage.</p>}
          </CardContent>
        </Card>

        {/* SOS dialog */}
        <Dialog open={sosOpen} onOpenChange={setSosOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>🚨 Alerte SOS</DialogTitle>
              <DialogDescription>
                L'alerte est enregistrée et tes contacts de confiance sont notifiés.
                En cas de danger immédiat, appelle le 112.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "unsafe_person", label: "Personne douteuse" },
                  { id: "unwell", label: "Je ne me sens pas bien" },
                  { id: "incident", label: "Incident / accident" },
                  { id: "other", label: "Autre" },
                ].map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setSosKind(k.id)}
                    className={`rounded-lg border px-3 py-2 text-sm ${sosKind === k.id ? "border-primary bg-primary/10 font-medium" : ""}`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={sosDetails}
                onChange={(e) => setSosDetails(e.target.value)}
                placeholder="Détails (facultatif)"
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSosOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleSOS}>Envoyer l'alerte</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Report dialog */}
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Signaler un contenu ou un utilisateur</DialogTitle>
              <DialogDescription>
                Les signalements sont traités par l'équipe de modération.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Motif : spam, fraude, insultes, harcèlement, contenu dangereux…"
              rows={3}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setReportOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleReport} disabled={!reportReason.trim()}>Envoyer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
