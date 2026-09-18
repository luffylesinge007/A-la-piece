import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { BankAccountCard } from "@/components/BankAccountCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { euros, friendlyError, formatDateTime, WITHDRAWAL_STATUS_META } from "@/lib/format";
import { ArrowUpRight, CalendarRange, Check, Landmark, Lightbulb, Plus, Target, Trash2, Wallet as WalletIcon, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Wallet() {
  const { user } = useAuth();
  const isTeen = user?.accountType === "teen";
  const isParent = user?.accountType === "parent";
  const stats = useQuery(api.stats.teenStats);
  const wallet = useQuery(api.wallet.getWallet);
  const transactions = useQuery(api.wallet.myTransactions);
  const goals = useQuery(api.wallet.myGoals);
  const withdrawals = useQuery(api.wallet.myWithdrawals);
  const guardianPending = useQuery(api.wallet.guardianWithdrawals);
  const payoutState = useQuery(api.wallet.payoutConfigured);
  const bank = useQuery(api.bank.myBankAccount);
  const pendingConsents = useQuery(api.bank.pendingBankConsents);

  const addGoal = useMutation(api.wallet.addGoal);
  const allocate = useMutation(api.wallet.allocateToGoal);
  const deleteGoal = useMutation(api.wallet.deleteGoal);
  const requestWithdrawal = useMutation(api.wallet.requestWithdrawal);
  const respondWithdrawal = useMutation(api.wallet.respondWithdrawal);
  const respondConsent = useMutation(api.bank.respondBankConsent);

  const [goalOpen, setGoalOpen] = useState(false);
  const [goalLabel, setGoalLabel] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [allocOpen, setAllocOpen] = useState<any>(null);
  const [allocAmount, setAllocAmount] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [destination, setDestination] = useState<"own_bank" | "guardian">("own_bank");
  const [busy, setBusy] = useState<string | null>(null);

  const available = wallet?.availableCents ?? 0;

  const handleAddGoal = async () => {
    const target = Math.round(Number(goalTarget) * 100);
    if (!goalLabel.trim() || !target || target <= 0) {
      toast.error("Donne un nom et un montant valide à ton objectif.");
      return;
    }
    setBusy("goal");
    try {
      await addGoal({ label: goalLabel.trim(), targetCents: target });
      toast.success("Objectif créé");
      setGoalOpen(false);
      setGoalLabel("");
      setGoalTarget("");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleAllocate = async () => {
    const amount = Math.round(Number(allocAmount) * 100);
    if (!amount || amount <= 0) return;
    setBusy("alloc");
    try {
      await allocate({ goalId: allocOpen._id, amountCents: amount });
      toast.success("Épargne mise de côté");
      setAllocOpen(null);
      setAllocAmount("");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleWithdraw = async () => {
    const amount = Math.round(Number(withdrawAmount) * 100);
    if (!amount || amount <= 0) {
      toast.error("Indique un montant valide.");
      return;
    }
    if (amount > available) {
      toast.error("Le montant dépasse ton solde disponible.");
      return;
    }
    setBusy("withdraw");
    try {
      await requestWithdrawal({ amountCents: amount, destination });
      toast.success(
        destination === "own_bank"
          ? "Virement lancé vers ton compte bancaire"
          : "Demande envoyée à ton responsable",
      );
      setWithdrawOpen(false);
      setWithdrawAmount("");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleRespond = async (withdrawalId: any, approve: boolean) => {
    setBusy("guardian");
    try {
      await respondWithdrawal({ withdrawalId, approve });
      toast.success(approve ? "Retrait validé" : "Retrait refusé — montant restitué");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleConsent = async (teenUserId: any, approve: boolean) => {
    setBusy("consent");
    try {
      await respondConsent({ teenUserId, approve });
      toast.success(approve ? "Autorisation accordée" : "Autorisation refusée");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight"><WalletIcon className="size-6 text-primary" /> Mon argent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeen
              ? "Ton argent gagné mission après mission. Verse-le sur ton propre compte bancaire ou celui de ton responsable."
              : isParent
                ? "Autorise le compte bancaire de ton ado, valide ses retraits et suis les virements."
                : "Historique de tes paiements et remboursements."}
          </p>
        </div>

        {/* Parent: pending bank-account consents (spec #43 §2) */}
        {isParent && pendingConsents && pendingConsents.length > 0 && (
          <Card className="card-shadow border-sky-500/40 bg-sky-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Landmark className="size-4 text-sky-500" /> Autorisation compte bancaire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingConsents.map((c: any) => (
                <div key={c.teenUserId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3.5">
                  <p className="text-sm">
                    <strong>{c.teenName}</strong> souhaite recevoir ses gains sur son propre compte bancaire.
                    Ton autorisation est demandée une seule fois pour cette fonctionnalité.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === "consent"}
                      onClick={() => handleConsent(c.teenUserId, false)}
                    >
                      Refuser
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy === "consent"}
                      onClick={() => handleConsent(c.teenUserId, true)}
                    >
                      <Check className="size-4" /> Autoriser
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Guardian: withdrawals awaiting decision */}
        {isParent && guardianPending && guardianPending.length > 0 && (
          <Card className="card-shadow border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Landmark className="size-4 text-amber-500" /> Retraits à valider
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {guardianPending.map((w: any) => (
                <div key={w._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3.5">
                  <div>
                    <p className="text-sm font-semibold">
                      {w.teenName} souhaite virer <strong>{euros(w.amountCents)}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">Demandé le {formatDateTime(w.requestedAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy === "guardian"} onClick={() => handleRespond(w._id, false)}>
                      <X className="size-4" /> Refuser
                    </Button>
                    <Button size="sm" disabled={busy === "guardian"} onClick={() => handleRespond(w._id, true)}>
                      <Check className="size-4" /> Valider
                    </Button>
                  </div>
                </div>
              ))}
              {payoutState && !payoutState.configured && (
                <p className="text-xs text-muted-foreground">
                  Le virement bancaire réel s'activera dès que la clé de paiement sera configurée. Les validations restent enregistrées.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Balances */}
        <div className="grid gap-3 sm:grid-cols-3">
          {!wallet ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
          ) : (
            <>
              <Card className="card-shadow-lg border-primary/40 bg-primary/5 sm:col-span-1">
                <CardContent className="p-5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <WalletIcon className="size-3.5" /> Solde disponible
                  </p>
                  <p className="mt-1 font-display text-3xl font-extrabold">{euros(available)}</p>
                  {isTeen && available > 0 && (
                    <Button size="sm" className="mt-3 w-full" onClick={() => { setDestination(bank?.payoutReady ? "own_bank" : "guardian"); setWithdrawOpen(true); }}>
                      <ArrowUpRight className="size-4" /> Recevoir sur mon compte bancaire
                    </Button>
                  )}
                </CardContent>
              </Card>
              <Card className="card-shadow border-border/60">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-muted-foreground">En attente</p>
                  <p className="mt-1 font-display text-2xl font-bold">{euros(wallet.pendingCents)}</p>
                  <p className="text-[11px] text-muted-foreground">missions à confirmer</p>
                </CardContent>
              </Card>
              <Card className="card-shadow border-border/60">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-muted-foreground">Total gagné</p>
                  <p className="mt-1 font-display text-2xl font-bold">{euros(wallet.totalEarnedCents)}</p>
                  <p className="text-[11px] text-muted-foreground">depuis le début</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Gains this week/month (teens) */}
        {isTeen && stats && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="card-shadow border-coin/40 bg-coin/5">
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarRange className="size-3.5" /> Cette semaine</p>
                <p className="mt-1 font-display text-xl font-extrabold text-amber-700 dark:text-coin">{euros(stats.weekCents)}</p>
              </CardContent>
            </Card>
            <Card className="card-shadow border-border/60">
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarRange className="size-3.5" /> Ce mois-ci</p>
                <p className="mt-1 font-display text-xl font-extrabold">{euros(stats.monthCents)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Withdrawal history (teens) */}
        {isTeen && withdrawals && withdrawals.length > 0 && (
          <Card className="card-shadow border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-base"><Landmark className="size-4 text-primary" /> Mes retraits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {withdrawals.map((w: any) => {
                const meta = WITHDRAWAL_STATUS_META[w.status];
                return (
                  <div key={w._id} className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
                    <div>
                      <p className="text-sm font-semibold">{euros(w.amountCents)}</p>
                      <p className="text-xs text-muted-foreground">Demandé le {formatDateTime(w.requestedAt)}</p>
                      {w.status === "failed" && w.failureReason && (
                        <p className="mt-0.5 text-xs text-destructive">{w.failureReason}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={meta?.className}>{meta?.label ?? w.status}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Savings goals */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base"><Target className="size-4 text-primary" /> Mes objectifs</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setGoalOpen(true)}>
              <Plus className="size-4" /> Nouvel objectif
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!goals ? (
              <Skeleton className="h-16 rounded-xl" />
            ) : goals.length === 0 ? (
              <EmptyState
                icon={<Target className="size-7" />}
                title="Aucun objectif pour l'instant"
                description="Un nouveau téléphone ? Un vélo ? Crée un objectif et mets-y ton argent de mission de côté."
                actions={[{ label: "Créer mon premier objectif", to: "/portefeuille" }]}
                className="border-0 bg-transparent py-6"
              />
            ) : (
              goals.map((g: any) => {
                const pct = Math.min(100, Math.round((g.savedCents / g.targetCents) * 100));
                const missing = Math.max(0, g.targetCents - g.savedCents);
                const missionsNeeded = Math.ceil(missing / 1500); // ≈ 15 € per mission
                return (
                  <div key={g._id} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Target className="size-4 text-primary" />
                        <div>
                          <p className="text-sm font-semibold">{g.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {euros(g.savedCents)} / {euros(g.targetCents)} · {pct} %
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setAllocOpen(g)} disabled={available === 0}>
                          Alimenter
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Supprimer l'objectif" onClick={() => deleteGoal({ goalId: g._id }).catch((e) => toast.error(friendlyError(e)))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} className="mt-3 h-2" />
                    {missing > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                        <span>
                          Il te manque <strong>{euros(missing)}</strong> — à raison de ~15 € par mission : ≈ <strong>{missionsNeeded} mission{missionsNeeded > 1 ? "s" : ""}</strong> (estimation, non garantie).
                        </span>
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Historique</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!transactions ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucune transaction pour l'instant — elle apparaîtra ici après ta première mission payée.
              </p>
            ) : (
              transactions.map((t: any) => (
                <div key={t._id} className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-display font-bold ${t.amountCents >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                      {t.amountCents > 0 ? "+" : ""}{t.amountCents === 0 ? "—" : euros(t.amountCents)}
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {t.status === "completed" ? "Terminé" : t.status === "pending" ? "En attente" : t.status === "refunded" ? "Restitué" : t.status === "failed" ? "Échec" : t.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Teen: bank account management (spec #43) */}
        {isTeen && <BankAccountCard />}

        {/* Withdrawal dialog */}
        <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Recevoir mon argent</DialogTitle>
              <DialogDescription>
                {destination === "own_bank"
                  ? "Virement direct vers ton compte bancaire à ton nom — sans validation à chaque paiement."
                  : "Le montant est viré au compte de ton responsable légal, après sa validation."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="withdrawAmount">Montant (€) — disponible : {euros(available)}</Label>
                <Input
                  id="withdrawAmount"
                  type="number"
                  min={1}
                  max={available / 100}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="20"
                />
              </div>
              <div className="flex gap-2">
                {[10, 20, 50].filter((v) => v * 100 <= available).map((v) => (
                  <Button key={v} size="sm" variant="outline" type="button" onClick={() => setWithdrawAmount(String(v))}>
                    {v} €
                  </Button>
                ))}
                {available > 0 && (
                  <Button size="sm" variant="ghost" type="button" onClick={() => setWithdrawAmount(String(available / 100))}>
                    Tout
                  </Button>
                )}
              </div>
              {bank?.account && (
                <div className="space-y-1.5">
                  <Label>Vers quel compte ?</Label>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => bank.payoutReady && setDestination("own_bank")}
                      disabled={!bank.payoutReady}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${destination === "own_bank" ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
                    >
                      <Landmark className="size-4 shrink-0 text-primary" />
                      <span className="text-sm">
                        <span className="font-semibold">Mon compte bancaire</span>
                        <span className="block text-xs text-muted-foreground">
                          {bank.payoutReady
                            ? `•••• ${bank.account.last4 ?? "••••"} — virement direct`
                            : "Vérification en cours — indisponible pour l'instant"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestination("guardian")}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${destination === "guardian" ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
                    >
                      <WalletIcon className="size-4 shrink-0 text-primary" />
                      <span className="text-sm">
                        <span className="font-semibold">Compte de mon responsable</span>
                        <span className="block text-xs text-muted-foreground">Nécessite sa validation</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
              {bank && !bank.account && (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Astuce : ajoute ton compte bancaire depuis « Mon compte bancaire » plus bas pour recevoir
                  tes paiements directement, sans validation à chaque fois.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Le montant est réservé dès la demande. Si le virement échoue, il est automatiquement remis dans ton solde.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>Annuler</Button>
              <Button onClick={handleWithdraw} disabled={busy !== null || !withdrawAmount}>
                {destination === "own_bank" ? "Recevoir sur mon compte" : "Envoyer la demande"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Goal dialog */}
        <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel objectif d'épargne</DialogTitle>
              <DialogDescription>Ex : Nouveau téléphone, Vélo, Concert…</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="goalLabel">Nom de l'objectif</Label>
                <Input id="goalLabel" value={goalLabel} onChange={(e) => setGoalLabel(e.target.value)} maxLength={40} placeholder="Nouveau téléphone" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goalTarget">Montant cible (€)</Label>
                <Input id="goalTarget" type="number" min={1} value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="300" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setGoalOpen(false)}>Annuler</Button>
              <Button onClick={handleAddGoal} disabled={busy !== null}>Créer l'objectif</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Allocate dialog */}
        <Dialog open={!!allocOpen} onOpenChange={(v) => !v && setAllocOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Épargner pour « {allocOpen?.label} »</DialogTitle>
              <DialogDescription>
                Solde disponible : {euros(available)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="allocAmount">Montant (€)</Label>
              <Input
                id="allocAmount"
                type="number"
                min={1}
                max={available / 100}
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
                placeholder="20"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAllocOpen(null)}>Annuler</Button>
              <Button onClick={handleAllocate} disabled={busy !== null}>Épargner</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
