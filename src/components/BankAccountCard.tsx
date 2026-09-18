import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, Landmark, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/format";

/**
 * « Mon compte bancaire » — the teen's own payout account (spec #43).
 *
 * Honest states: not-configured provider, pending onboarding, awaiting
 * verification, ready, and consent pending for under-16s. Bank details are
 * never collected here — Stripe's hosted onboarding does that; we only ask
 * the account holder name shown for display and confirm with an emailed code.
 */
export function BankAccountCard() {
  const bank = useQuery(api.bank.myBankAccount);
  const payoutState = useQuery(api.wallet.payoutConfigured);
  const requestCode = useMutation(api.bank.requestChangeCode);
  const confirmAccount = useMutation(api.bank.confirmBankAccount);
  const removeAccount = useMutation(api.bank.removeBankAccount);
  const onboardingLink = useAction(api.bankActions.createOnboardingLink);
  const refreshStatus = useAction(api.bankActions.refreshBankStatus);

  const [flow, setFlow] = useState<"add" | "remove" | null>(null);
  const [code, setCode] = useState("");
  const [holderName, setHolderName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Reset the dialog when it closes.
  useEffect(() => {
    if (!flow) {
      setCode("");
      setHolderName("");
    }
  }, [flow]);

  if (bank === undefined) {
    return (
      <Card className="card-shadow border-border/60">
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement du compte bancaire…
        </CardContent>
      </Card>
    );
  }

  // Non-teen accounts have no bank account feature.
  if (bank === null) return null;

  const account = bank.account;
  const configured = payoutState?.configured ?? false;

  const requestAndOpen = async (kind: "add" | "remove") => {
    setBusy("code");
    try {
      await requestCode({});
      setFlow(kind);
      toast.success("Code envoyé par email — il est valable 10 minutes.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = async () => {
    if (code.length !== 6) return;
    setBusy(flow === "add" ? "confirm" : "verify");
    try {
      if (flow === "add") {
        if (holderName.trim().length < 3) {
          toast.error("Indique le nom du titulaire du compte.");
          return;
        }
        await confirmAccount({ code, holderName: holderName.trim() });
        toast.success("Compte enregistré — la page sécurisée de Stripe te demande tes coordonnées.");
      } else {
        await removeAccount({ code });
        toast.success("Compte bancaire supprimé");
      }
      setFlow(null);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const openOnboarding = async () => {
    setBusy("onboarding");
    try {
      const res: any = await onboardingLink({});
      if (res?.url) window.location.assign(res.url);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const res: any = await refreshStatus({});
      if (res?.payoutsEnabled) {
        toast.success("Compte bancaire vérifié — tu peux recevoir tes gains !");
      } else {
        toast.info("Configuration incomplète — reprends la vérification Stripe.");
      }
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card className="card-shadow border-border/60">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Landmark className="size-5" />
              </span>
              <div>
                <p className="flex items-center gap-1.5 font-display font-bold">Mon compte bancaire</p>
                {!account ? (
                  <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
                    Renseigne ton propre compte (à ton nom) pour recevoir tes gains directement.
                    Tes coordonnées bancaires sont enregistrées uniquement chez notre prestataire
                    de paiement réglementé — jamais sur À LA PIÈCE.
                  </p>
                ) : (
                  <div className="mt-0.5 space-y-0.5 text-sm text-muted-foreground">
                    <p>
                      {account.bankName ? `${account.bankName} · ` : ""}
                      {account.last4 ? `•••• ${account.last4} · ` : ""}
                      Titulaire : <span className="font-medium text-foreground">{account.holderName}</span>
                    </p>
                    <p className="text-xs">
                      Ajouté le {new Date(account.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {!account && (
                <Button onClick={() => requestAndOpen("add")} disabled={busy !== null}>
                  <Landmark className="size-4" /> Ajouter un compte bancaire
                </Button>
              )}
              {account && account.status === "pending" && !configured && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  En attente du prestataire
                </Badge>
              )}
              {account && account.status === "pending" && configured && !(account.payoutsEnabled) && (
                <Button size="sm" variant="outline" onClick={openOnboarding} disabled={busy !== null}>
                  <Lock className="size-4" /> Terminer la configuration
                </Button>
              )}
              {account?.payoutsEnabled && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-3.5" /> Vérifié
                </Badge>
              )}
            </div>
          </div>

          {/* Consent status (under-16) */}
          {bank.needsConsent && account && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
              {bank.consent?.status === "approved" ? (
                <>
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                  Autorisation de ton responsable : accordée.
                </>
              ) : bank.consent?.status === "pending" ? (
                <>
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  En attente de l'autorisation de ton responsable (demandée une seule fois).
                </>
              ) : (
                <>
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  L'autorisation de ton responsable est requise avant les virements vers ton compte.
                </>
              )}
            </p>
          )}

          {account && account.status === "pending" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={refresh} disabled={busy !== null}>
                {busy === "refresh" ? <Loader2 className="size-4 animate-spin" /> : null}
                J'ai terminé sur Stripe — vérifier
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => requestAndOpen("remove")} disabled={busy !== null}>
                Supprimer
              </Button>
            </div>
          )}
          {account && account.status === "verified" && (
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              Pour modifier ton compte, tu devras confirmer avec un code envoyé par email.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step-up dialog — code + holder details in one verified call */}
      <Dialog open={flow !== null} onOpenChange={(v) => !v && setFlow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {flow === "add" ? "Ajouter mon compte bancaire" : "Supprimer le compte bancaire"}
            </DialogTitle>
            <DialogDescription>
              Un code à 6 chiffres vient d'être envoyé à ton adresse email (valable 10 minutes).
              Il sécurise la modification de ton compte de réception.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Code de vérification</Label>
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {flow === "add" && (
              <div className="space-y-1.5">
                <Label htmlFor="holderName">Nom du titulaire (tel que sur le RIB)</Label>
                <Input
                  id="holderName"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  maxLength={60}
                  placeholder="Prénom Nom"
                />
                <p className="text-xs text-muted-foreground">
                  Les coordonnées bancaires elles-mêmes seront saisies sur la page sécurisée de notre
                  prestataire de paiement — jamais dans l'application.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFlow(null)}>Annuler</Button>
            <Button
              onClick={handleSubmit}
              disabled={code.length !== 6 || busy !== null || (flow === "add" && holderName.trim().length < 3)}
            >
              {busy !== null ? <Loader2 className="size-4 animate-spin" /> : null}
              {flow === "add" ? "Enregistrer" : "Confirmer la suppression"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
