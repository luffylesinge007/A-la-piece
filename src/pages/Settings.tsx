import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { friendlyError } from "@/lib/format";
import { BookOpen, Download, KeyRound, Link2, Lock, LogOut, Moon, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    () => (localStorage.getItem("alp-theme") as any) ?? "system",
  );
  useEffect(() => {
    const root = document.documentElement;
    const apply = (t: "light" | "dark") => root.classList.toggle("dark", t === "dark");
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");
      const onChange = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    apply(theme);
  }, [theme]);
  const update = (t: "light" | "dark" | "system") => {
    setTheme(t);
    localStorage.setItem("alp-theme", t);
  };
  return { theme, update };
}

export default function Settings() {
  const { user, settings, isMinor } = useAuth();
  const updateSettings = useMutation(api.profiles.updateSettings);
  const { theme, update: setTheme } = useTheme();
  const navigate = useNavigate();

  // --- Account security & RGPD -------------------------------------------
  const sessionInfo = useQuery(api.profiles.sessionCount);
  const revokeSessions = useMutation(api.profiles.revokeAllMySessions);
  const exportData = useMutation(api.profiles.exportMyData);
  const deleteAccount = useMutation(api.profiles.deleteMyAccount);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const handleRevokeSessions = async () => {
    try {
      const res = await revokeSessions();
      toast.success(`${res.revoked} session(s) révoquée(s) — tu vas être déconnecté·e partout.`);
      setTimeout(() => window.location.assign("/"), 800);
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `alapiece-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export généré — vérifie tes téléchargements.");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== "SUPPRIMER") return;
    try {
      await deleteAccount({ confirm: "SUPPRIMER" });
      toast.success("Compte supprimé — tes données personnelles ont été anonymisées.");
      setTimeout(() => window.location.assign("/"), 800);
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const handle = async (patch: Record<string, unknown>) => {
    try {
      await updateSettings(patch as any);
      toast.success("Préférence enregistrée");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const toggle = (key: string, value: boolean, locked: boolean, lockedMsg: string) => (
    <Switch
      checked={value}
      disabled={locked}
      onCheckedChange={(v) => handle({ [key]: v })}
      aria-label={locked ? lockedMsg : key}
      title={locked ? lockedMsg : undefined}
    />
  );

  const allowMessages = settings?.allowMessages ?? false;
  const isTeen = user?.accountType === "teen";

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Paramètres</h1>
          <p className="mt-1 text-sm text-muted-foreground">Compte, confidentialité, apparence et aide.</p>
        </div>

        {/* Privacy */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base"><Lock className="size-4" /> Confidentialité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Profil public</p>
                <p className="text-xs text-muted-foreground">Ton prénom, ta ville et tes compétences sont visibles.</p>
              </div>
              {isMinor
                ? toggle("profileVisibility", false, true, "Les mineurs gardent un profil privé")
                : toggle("profileVisibility", (settings?.profileVisibility ?? "public") === "public", false, "")}
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Recevoir des messages</p>
                <p className="text-xs text-muted-foreground">Autoriser les messages d'autres membres.</p>
              </div>
              {toggle(
                "allowMessages",
                allowMessages,
                !!isMinor,
                "Les mineurs ne peuvent pas autoriser les messages inconnus",
              )}
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Apparaître dans les classements</p>
                <p className="text-xs text-muted-foreground">V2 — visible quand les classements arrivent.</p>
              </div>
              {toggle("showOnLeaderboard", settings?.showOnLeaderboard ?? false, false, "")}
            </div>
            {isMinor && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Certaines protections sont verrouillées pour les mineurs : profil privé, position masquée,
                  messages restreints. C'est le choix de sécurité d'À LA PIÈCE.
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Sun className="size-4" /><Moon className="size-4" /> Apparence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Thème</p>
              <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Clair</SelectItem>
                  <SelectItem value="dark">Sombre</SelectItem>
                  <SelectItem value="system">Automatique</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Réduire les animations</p>
                <p className="text-xs text-muted-foreground">Moins de mouvement à l'écran (bientôt synchronisé avec le système).</p>
              </div>
              {toggle("reduceAnimations", settings?.reduceAnimations ?? false, false, "")}
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Langue</p>
              <Select value={settings?.language ?? "fr"} onValueChange={(v) => handle({ language: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en" disabled>English (bientôt)</SelectItem>
                  <SelectItem value="es" disabled>Español (bientôt)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Family shortcut */}
        {isTeen && (
          <Card className="card-shadow border-border/60">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="text-sm">
                <p className="font-semibold">Famille & responsable</p>
                <p className="text-muted-foreground">Gère ton contact de confiance et ses autorisations.</p>
              </div>
              <Button variant="outline" asChild>
                <Link to="/securite"><Link2 className="size-4" /> Ouvrir</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Account security */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <KeyRound className="size-4" /> Sécurité du compte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Sessions actives</p>
                <p className="text-xs text-muted-foreground">
                  {sessionInfo
                    ? `${sessionInfo.sessions} appareil(s) connecté(s) à ton compte.`
                    : "Chargement…"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRevokeSessions}>
                <LogOut className="size-4" /> Déconnecter partout
              </Button>
            </div>
            <Separator />
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              <span>
                Connexion sans mot de passe par code à usage unique (15 min), limitée à 5 essais —
              après quoi l'accès est temporairement bloqué. Toute connexion et tout changement sensible
              sont enregistrés côté serveur, sans jamais stocker de secret.
              </span>
            </p>
          </CardContent>
        </Card>

        {/* RGPD — my data */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Download className="size-4" /> Mes données (RGPD)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Exporter mes données</p>
                <p className="text-xs text-muted-foreground">Tout ce que la plateforme sait sur toi, en JSON.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="size-4" /> Exporter
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-destructive">Supprimer mon compte</p>
                <p className="text-xs text-muted-foreground">Anonymise tes données personnelles et déconnecte tous tes appareils. Irréversible.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" /> Supprimer
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account / legal */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Compte & aide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Compte : <strong>{user?.email ?? "connecté"}</strong> · rôle{" "}
              <strong>{user?.accountType}</strong>
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <BookOpen className="size-4 shrink-0" /> Une question ? Écris à <strong>support@alapiece.app</strong> — nous répondons sous 24 h ouvrées.
            </p>
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              <span>
                Confidentialité : ton adresse exacte, ton téléphone et ta position ne sont jamais visibles publiquement.
                Les paiements sont traités par Stripe ; aucune donnée bancaire n'est stockée sur la plateforme.
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer définitivement ton compte ?</DialogTitle>
              <DialogDescription>
                Tes données personnelles (nom, ville, date de naissance, compte de virement) seront
                anonymisées et toutes tes sessions révoquées. Cette action est irréversible.
                Tape <strong>SUPPRIMER</strong> pour confirmer.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="SUPPRIMER"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Annuler</Button>
              <Button variant="destructive" disabled={deleteConfirm !== "SUPPRIMER"} onClick={handleDelete}>
                Supprimer mon compte
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
