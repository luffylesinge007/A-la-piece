import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { euros, friendlyError, formatDateTime } from "@/lib/format";
import { Plus, Target, Trash2, Wallet as WalletIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Wallet() {
  const { user } = useAuth();
  const isTeen = user?.accountType === "teen";
  const stats = useQuery(api.stats.teenStats);
  const wallet = useQuery(api.wallet.getWallet);
  const transactions = useQuery(api.wallet.myTransactions);
  const goals = useQuery(api.wallet.myGoals);

  const addGoal = useMutation(api.wallet.addGoal);
  const allocate = useMutation(api.wallet.allocateToGoal);
  const deleteGoal = useMutation(api.wallet.deleteGoal);

  const [goalOpen, setGoalOpen] = useState(false);
  const [goalLabel, setGoalLabel] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [allocOpen, setAllocOpen] = useState<any>(null);
  const [allocAmount, setAllocAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAddGoal = async () => {
    const target = Math.round(Number(goalTarget) * 100);
    if (!goalLabel.trim() || !target || target <= 0) {
      toast.error("Donne un nom et un montant valide à ton objectif.");
      return;
    }
    setBusy(true);
    try {
      await addGoal({ label: goalLabel.trim(), targetCents: target });
      toast.success("Objectif créé 🎯");
      setGoalOpen(false);
      setGoalLabel("");
      setGoalTarget("");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleAllocate = async () => {
    const amount = Math.round(Number(allocAmount) * 100);
    if (!amount || amount <= 0) return;
    setBusy(true);
    try {
      await allocate({ goalId: allocOpen._id, amountCents: amount });
      toast.success("Épargne mise de côté 💰");
      setAllocOpen(null);
      setAllocAmount("");
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
          <h1 className="font-display text-2xl font-extrabold tracking-tight">💰 Mon portefeuille</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeen
              ? "Ton argent gagné mission après mission. Retrait via ton responsable bientôt disponible."
              : "Historique de tes paiements et remboursements."}
          </p>
        </div>

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
                  <p className="mt-1 font-display text-3xl font-extrabold">{euros(wallet.availableCents)}</p>
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
                  <p className="text-[11px] text-muted-foreground">depuis le début 🚀</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>        {/* Gains this week/month (teens) */}
        {isTeen && stats && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="card-shadow border-coin/40 bg-coin/5">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">📅 Cette semaine</p>
                <p className="mt-1 font-display text-xl font-extrabold text-amber-700 dark:text-coin">{euros(stats.weekCents)}</p>
              </CardContent>
            </Card>
            <Card className="card-shadow border-border/60">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">🗓️ Ce mois-ci</p>
                <p className="mt-1 font-display text-xl font-extrabold">{euros(stats.monthCents)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Savings goals */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="font-display text-base">🎯 Mes objectifs</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setGoalOpen(true)}>
              <Plus className="size-4" /> Nouvel objectif
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!goals ? (
              <Skeleton className="h-16 rounded-xl" />
            ) : goals.length === 0 ? (
              <EmptyState
                emoji="🎯"
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
                        <Button size="sm" variant="outline" onClick={() => setAllocOpen(g)} disabled={(wallet?.availableCents ?? 0) === 0}>
                          Alimenter
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Supprimer l'objectif" onClick={() => deleteGoal({ goalId: g._id }).catch((e) => toast.error(friendlyError(e)))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} className="mt-3 h-2" />
                    {missing > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        💡 Il te manque <strong>{euros(missing)}</strong> — à raison de ~15 € par mission : ≈ <strong>{missionsNeeded} mission{missionsNeeded > 1 ? "s" : ""}</strong> (estimation, non garantie).
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
                      {t.amountCents >= 0 ? "+" : ""}{euros(t.amountCents)}
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {t.status === "completed" ? "Terminé" : t.status === "pending" ? "En attente" : t.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

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
              <Button onClick={handleAddGoal} disabled={busy}>Créer l'objectif</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Allocate dialog */}
        <Dialog open={!!allocOpen} onOpenChange={(v) => !v && setAllocOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Épargner pour « {allocOpen?.label} »</DialogTitle>
              <DialogDescription>
                Solde disponible : {euros(wallet?.availableCents ?? 0)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="allocAmount">Montant (€)</Label>
              <Input
                id="allocAmount"
                type="number"
                min={1}
                max={(wallet?.availableCents ?? 0) / 100}
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
                placeholder="20"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAllocOpen(null)}>Annuler</Button>
              <Button onClick={handleAllocate} disabled={busy}>Épargner</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
