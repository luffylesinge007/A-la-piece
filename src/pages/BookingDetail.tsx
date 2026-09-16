import { useAuth } from "@/hooks/use-auth";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BOOKING_STATUS_META, PAYMENT_STATUS_META, eurosFromNumber, formatDate, formatDuration, friendlyError, formatDateTime } from "@/lib/format";
import { ProfileAvatar } from "@/components/icons";
import {
  AlertTriangle, ArrowLeft, Ban, Check, CheckCircle2, CreditCard, FileCheck, Lock, MapPin, Play, ShieldAlert, ShieldCheck, Siren, Star, Star as StarFilled, Hourglass,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

const STEPS = ["Acceptée", "Confirmation & paiement", "Début", "En cours", "Fin", "Paiement versé"];

export default function BookingDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const booking = useQuery(api.bookings.getBooking, id ? { bookingId: id as any } : "skip");
  const reviewState = useQuery(api.reviews.forBooking, id ? { bookingId: id as any } : "skip");
  const stripeState = useQuery(api.payments.isConfigured);

  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ratings, setRatings] = useState({ general: 5, punctuality: 5, communication: 5, quality: 5, respect: 5, reliability: 5 });
  const [comment, setComment] = useState("");

  const checkIn = useMutation(api.bookings.checkIn);
  const checkOut = useMutation(api.bookings.checkOut);
  const confirmCompletion = useMutation(api.bookings.confirmCompletion);
  const cancel = useMutation(api.bookings.cancel);
  const openDispute = useMutation(api.bookings.openDispute);
  const releasePayment = useMutation(api.payments.releasePayment);
  const triggerSOS = useMutation(api.safety.triggerSOS);
  const submitReview = useMutation(api.reviews.submitReview);
  const createCheckoutSession = useAction(api.payments.createCheckoutSession);
  const createTipCheckoutSession = useAction(api.payments.createTipCheckoutSession);

  // Toast when returning from Stripe Checkout
  const paymentParam = searchParams.get("payment");
  useEffect(() => {
    if (paymentParam === "success") {
      toast.info("Paiement effectué — la confirmation Stripe arrive dans quelques secondes.");
      setSearchParams({}, { replace: true });
    } else if (paymentParam === "tip_success") {
      toast.info("Pourboire envoyé — merci ! La confirmation Stripe arrive dans quelques secondes.");
      setSearchParams({}, { replace: true });
    } else if (paymentParam === "cancelled") {
      toast.info("Paiement annulé — tu peux réessayer quand tu veux.");
      setSearchParams({}, { replace: true });
    }
  }, [paymentParam, setSearchParams]);

  if (booking === undefined) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (booking === null) {
    return (
      <AppShell>
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <p className="font-display text-lg font-bold">Réservation introuvable</p>
            <p className="mt-1 text-sm text-muted-foreground">Ou accès non autorisé.</p>
            <Button className="mt-4" variant="outline" asChild><Link to="/reservations">Retour</Link></Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const isTeen = booking.role === "teen";
  const statusMeta = BOOKING_STATUS_META[booking.status];
  const currentStep = statusMeta?.step ?? 0;

  const handlePay = async () => {
    setBusy("pay");
    try {
      const result: any = await createCheckoutSession({
        bookingId: booking._id,
        origin: window.location.origin,
      });
      if (result?.checkoutUrl) {
        toast.info("Redirection vers Stripe…");
        window.location.assign(result.checkoutUrl);
      } else {
        toast.error("Impossible de créer la session de paiement.");
      }
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const action = async (name: string, fn: () => Promise<unknown>, successMessage: string) => {
    setBusy(name);
    try {
      await fn();
      toast.success(successMessage);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleTip = async (amountEuros: number) => {
    setBusy("tip");
    try {
      const result: any = await createTipCheckoutSession({
        bookingId: booking._id,
        amountEuros,
        origin: window.location.origin,
      });
      if (result?.checkoutUrl) {
        toast.info("Redirection vers Stripe…");
        window.location.assign(result.checkoutUrl);
      } else {
        toast.error("Impossible de créer le pourboire.");
      }
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleReview = async () => {
    setBusy("review");
    try {
      await submitReview({
        bookingId: booking._id,
        rating: ratings.general,
        punctuality: ratings.punctuality,
        communication: ratings.communication,
        quality: ratings.quality,
        respect: ratings.respect,
        reliability: ratings.reliability,
        comment: comment.trim() || undefined,
      });
      toast.success("Merci pour ton avis");
      setReviewOpen(false);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };


  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/reservations"><ArrowLeft className="size-4" /> Réservations</Link>
        </Button>

        {/* Header */}
        <Card className="card-shadow-lg border-border/60">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusMeta?.className}>{statusMeta?.label}</Badge>
                  {booking.payment && (
                    <Badge variant="outline" className={PAYMENT_STATUS_META[booking.payment.status]?.className}>
                      {PAYMENT_STATUS_META[booking.payment.status]?.label}
                    </Badge>
                  )}
                </div>
                <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight">
                  {booking.mission?.title}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(booking.mission?.scheduledDate ?? "")} à {booking.mission?.scheduledTime} ·{" "}
                  {formatDuration(booking.mission?.durationMin ?? 0)} · {eurosFromNumber(booking.priceEuros)}
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <span className="grid size-11 place-items-center rounded-full bg-secondary text-primary">
                  <ProfileAvatar icon={booking.counterpart?.avatarIcon} name={booking.counterpart?.firstName} iconClassName="size-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">{isTeen ? "Adulte" : "Ado"}</p>
                  <p className="font-display font-bold">{booking.counterpart?.firstName}</p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="mt-6">
              <div className="flex items-center">
                {STEPS.map((label, i) => {
                  const done = i < currentStep;
                  const isCurrent = i === currentStep - 1;
                  return (
                    <div key={label} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center">
                        <span
                          className={`grid size-7 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                            done || isCurrent
                              ? "bg-primary text-primary-foreground"
                              : "border bg-card text-muted-foreground"
                          }`}
                        >
                          {done ? <Check className="size-4" aria-label="Terminé" /> : i + 1}
                        </span>
                        <span className="mt-1 hidden max-w-16 text-center text-[10px] leading-tight text-muted-foreground sm:block">
                          {label}
                        </span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`mx-1 h-0.5 flex-1 rounded ${done ? "bg-primary" : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment section (adult) */}
        {!isTeen && booking.status === "pending" && (
          <Card className="card-shadow border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-5">
              <p className="font-display font-bold">Étape suivante : sécuriser le paiement</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Le paiement passe par Stripe Checkout. Les fonds sont sécurisés dès la confirmation
                et versés à l'adolescent après la confirmation de la mission.
              </p>
              {stripeState?.configured ? (
                <Button className="mt-3 w-full" size="lg" onClick={handlePay} disabled={busy === "pay"}>
                  <CreditCard className="size-4" /> Payer en sécurité via Stripe
                </Button>
              ) : (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4 text-amber-500" /> Paiement non configuré
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Aucune transaction ne peut être créée : la clé Stripe n'est pas encore ajoutée à cet
                    environnement. Ajoute <code className="rounded bg-muted px-1">STRIPE_SECRET_KEY</code> dans
                    l'onglet Clés API pour activer le vrai paiement. La mission reste réservée en attente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {booking.payment?.status === "processing" && (
          <Card className="card-shadow border-brand/40 bg-brand/5">
            <CardContent className="flex items-center gap-3 p-4 text-sm">
              <Lock className="size-4 text-brand" />
              Paiement en cours de confirmation par Stripe… Cette page se met à jour automatiquement.
            </CardContent>
          </Card>
        )}

        {/* PIN section (teen, before check-in) */}
        {isTeen && booking.status === "confirmed" && booking.requiresPin && (
          <Card className="card-shadow border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Lock className="size-4" /> Code PIN</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Demande le code à 4 chiffres à {booking.counterpart?.firstName} sur place, puis saisis-le pour démarrer la mission.
              </p>
              <div className="flex gap-2">
                <Input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  inputMode="numeric"
                  className="w-32 text-center text-lg tracking-[0.5em]"
                  maxLength={4}
                />
                <Button
                  onClick={() => action("pin", () => checkIn({ bookingId: booking._id, pin }), "Mission commencée")}
                  disabled={busy !== null || pin.length !== 4}
                >
                  Valider et commencer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mission actions */}
        <Card className="card-shadow border-border/60">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {isTeen && booking.status === "confirmed" && !booking.requiresPin && (
                <Button
                  onClick={() => action("start", () => checkIn({ bookingId: booking._id }), "Mission commencée")}
                  disabled={busy !== null}
                  size="lg"
                >
                  <Play className="size-4" /> COMMENCER LA MISSION
                </Button>
              )}
              {isTeen && booking.status === "in_progress" && (
                <Button
                  onClick={() => action("finish", () => checkOut({ bookingId: booking._id }), "Mission terminée — en attente de confirmation.")}
                  disabled={busy !== null}
                  size="lg"
                >
                  <Check className="size-4" /> TERMINER LA MISSION
                </Button>
              )}
              {!isTeen && booking.status === "in_progress" && booking.checkOutAt && (
                <Button
                  onClick={() => action("confirm", () => confirmCompletion({ bookingId: booking._id }), "Mission confirmée")}
                  disabled={busy !== null}
                  size="lg"
                >
                  <CheckCircle2 className="size-4" /> Confirmer la mission
                </Button>
              )}
              {!isTeen && booking.status === "in_progress" && !booking.checkOutAt && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Hourglass className="size-4 text-amber-500" /> En attente du check-out de l'adolescent.</p>
              )}
              {!isTeen && booking.status === "completed" && booking.payment?.status === "held" && (
                <Button
                  onClick={() => action("release", () => releasePayment({ bookingId: booking._id }), "Paiement versé à l'ado")}
                  disabled={busy !== null}
                  size="lg"
                >
                  <CreditCard className="size-4" /> Libérer le paiement
                </Button>
              )}
              {booking.status === "completed" && booking.payment?.status === "released" && (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> Paiement versé — mission bouclée !
                </p>
              )}
              {["pending", "confirmed"].includes(booking.status) && (
                <Button
                  variant="outline"
                  onClick={() => action("cancel", () => cancel({ bookingId: booking._id }), "Réservation annulée.")}
                  disabled={busy !== null}
                >
                  <Ban className="size-4" /> Annuler
                </Button>
              )}
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDisputeOpen(true)}>
                <ShieldAlert className="size-4" /> Signaler un problème
              </Button>
            </div>

            {booking.mission?.exactAddress && (
              <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
                <MapPin className="size-4 text-primary" /> <span className="font-medium">Adresse :</span> {booking.mission.exactAddress}
              </p>
            )}
            {booking.mission?.safetyNotes && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" /> {booking.mission.safetyNotes}
              </p>
            )}
            {booking.checkInAt && booking.checkOutAt && (
              <p className="text-xs text-muted-foreground">
                Check-in : {formatDateTime(booking.checkInAt)} · Check-out : {formatDateTime(booking.checkOutAt)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tip section — either side can thank the other once the mission is done */}
        {booking.status === "completed" && booking.payment?.status === "released" && (
          <Card className="card-shadow border-coin/40 bg-coin/5">
            <CardContent className="p-5">
              <p className="font-display font-bold">Vous souhaitez remercier {booking.counterpart?.firstName} ?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Un pourboire optionnel, envoyé via un paiement sécurisé.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[2, 5, 10].map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    disabled={busy === "tip"}
                    onClick={() => handleTip(amount)}
                  >
                    {amount} €
                  </Button>
                ))}
                <Input
                  type="number"
                  min={1}
                  max={50}
                  placeholder="Autre"
                  className="w-24"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (v >= 1 && v <= 50) handleTip(v);
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Review section */}
        {booking.status === "completed" && reviewState && (
          <Card className="card-shadow border-border/60">
            <CardContent className="flex items-center justify-between gap-3 p-5">
              {reviewState.alreadyReviewed ? (
                <p className="flex items-center gap-2 text-sm">
                  <Star className="size-4 text-amber-500" />
                  Ton avis : {reviewState.myRating ?? 0}/5 — merci !
                </p>
              ) : reviewState.canReview ? (
                <>
                  <p className="text-sm font-medium">Comment s'est passée la mission ?</p>
                  <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
                    <SheetTrigger asChild>
                      <Button>Laisser un avis</Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="rounded-t-2xl overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle className="font-display">Ton avis sur {booking.counterpart?.firstName}</SheetTitle>
                        <SheetDescription>Mission « {booking.mission?.title} »</SheetDescription>
                      </SheetHeader>
                      <div className="space-y-4 px-4 pb-6">
                        {([
                          ["general", "Note générale"],
                          ["punctuality", "Ponctualité"],
                          ["communication", "Communication"],
                          ["quality", "Qualité"],
                          ["respect", "Respect"],
                          ["reliability", "Fiabilité"],
                        ] as const).map(([key, label]) => (
                          <div key={key}>
                            <Label>{label}</Label>
                            <div className="mt-1 flex gap-1">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setRatings((r) => ({ ...r, [key]: n }))}
                                  className={`transition-transform hover:scale-110 ${n <= ratings[key] ? "text-amber-500" : "text-muted-foreground/30"}`}
                                  aria-label={`${label} : ${n} étoiles`}
                                >
                                  <Star className={`size-6 ${n <= ratings[key] ? "fill-current" : ""}`} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <Textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Un commentaire (facultatif)"
                          rows={2}
                          maxLength={500}
                        />
                        <Button className="w-full" size="lg" onClick={handleReview} disabled={busy === "review"}>
                          Envoyer mon avis
                        </Button>
                      </div>
                    </SheetContent>
                  </Sheet>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">En attente de l'avis de l'autre participant…</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dispute dialog */}
        <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Signaler un problème</DialogTitle>
              <DialogDescription>
                Un litige suspend le paiement et alerte notre équipe de modération, qui examinera la situation.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Décris le problème rencontré…"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDisputeOpen(false)}>Fermer</Button>
              <Button
                variant="destructive"
                disabled={!disputeReason.trim()}
                onClick={() => action("dispute", () => openDispute({ bookingId: booking._id, reason: disputeReason }), "Litige ouvert — notre équipe est notifiée.")}
              >
                Ouvrir le litige
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* SOS always visible for teens during an active mission */}
        {isTeen && ["confirmed", "in_progress"].includes(booking.status) && (
          <Card className="border-rose-500/40 bg-rose-500/5">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="text-sm">
                <p className="font-semibold text-rose-600 dark:text-rose-400">Un souci pendant la mission ?</p>
                <p className="text-muted-foreground">En danger immédiat : appelle le 112. Sinon, ouvre l'alerte SOS.</p>
              </div>
              <Button
                variant="destructive"
                onClick={() =>
                  action(
                    "sos",
                    async () => {
                      const res: any = await triggerSOS({
                        bookingId: booking._id,
                        kind: "other",
                      });
                      toast.error(res?.message ?? "Alerte enregistrée.", { duration: 8000 });
                    },
                    "",
                  )
                }
                disabled={busy === "sos"}
              >
                <Siren className="size-4" /> SOS
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
