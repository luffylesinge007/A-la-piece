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
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AVATAR_CHOICES } from "@/pages/Onboarding";
import { euros, formatDateShort, formatDateTime, friendlyError } from "@/lib/format";
import { BadgeCheck, CalendarCheck, Check, FileText, Pencil, Star, Trophy, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const AVATARS = AVATAR_CHOICES;

export default function Profile() {
  const { user, profile, age } = useAuth();
  const stats = useQuery(api.stats.teenStats);
  const reputation = useQuery(api.reviews.reputation, user ? { userId: user._id } : "skip");
  const reviews = useQuery(api.reviews.myReviews);
  const updateProfile = useMutation(api.profiles.updateProfile);
  const [editOpen, setEditOpen] = useState(false);
  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [avatar, setAvatar] = useState(profile?.avatarEmoji ?? "🧑‍🎓");
  const [saving, setSaving] = useState(false);

  const isTeen = user?.accountType === "teen";

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ firstName: firstName.trim(), city: city.trim(), bio: bio.trim(), avatarEmoji: avatar });
      toast.success("Profil mis à jour ✨");
      setEditOpen(false);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  const verifications = [
    { key: "verifiedEmail", label: "Email vérifié", ok: profile.verifiedEmail },
    { key: "verifiedPhone", label: "Téléphone vérifié", ok: profile.verifiedPhone },
    { key: "verifiedIdentity", label: "Identité vérifiée", ok: profile.verifiedIdentity },
    { key: "verifiedPayment", label: "Paiement vérifié", ok: profile.verifiedPayment },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header card */}
        <Card className="card-shadow-lg overflow-hidden border-border/60">
          <div className="h-24 bg-gradient-to-r from-primary/25 via-primary/10 to-brand/25" />
          <CardContent className="-mt-10 p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-end gap-4">
                <span className="grid size-20 place-items-center rounded-2xl border-4 border-card bg-secondary text-4xl shadow-sm">
                  {profile.avatarEmoji ?? "👤"}
                </span>
                <div className="pb-1">
                  <h1 className="font-display text-2xl font-extrabold tracking-tight">
                    {profile.firstName} {profile.lastName ?? ""}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {profile.city ?? "Ville non renseignée"}
                    {isTeen && age !== null ? ` · ${age} ans` : ""}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Modifier
              </Button>
            </div>

            {profile.bio && <p className="mt-4 text-sm text-muted-foreground">{profile.bio}</p>}

            {/* Verification badges */}
            <div className="mt-4 flex flex-wrap gap-2">
              {verifications.map((v) => (
                <span
                  key={v.key}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    v.ok
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground/60"
                  }`}
                >
                  <BadgeCheck className="size-3.5" />
                  {v.label}
                </span>
              ))}
            </div>

            {/* Skills */}
            {(profile.skills?.length ?? 0) > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground">Compétences</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profile.skills!.map((s: string) => <Badge key={s} variant="secondary">{s}</Badge>)}
                </div>
              </div>
            )}
            {(profile.availability?.length ?? 0) > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-muted-foreground">Disponibilités</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profile.availability!.map((a: string) => <Badge key={a} variant="outline">{a}</Badge>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Teen: game profile — XP, niveau, badges */}
        {isTeen && (
          <>
            {stats && (
              <Card className="card-shadow border-coin/50 bg-gradient-to-r from-coin/15 via-coin/5 to-transparent">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progression</p>
                      <p className="font-display text-2xl font-extrabold">
                        🏆 Niveau {stats.level.number} — {stats.level.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {stats.xp} XP{stats.level.next ? ` · encore ${stats.level.next.minXp - stats.xp} XP → ${stats.level.next.title}` : " · niveau maximum 🎉"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl font-extrabold">⚡ {stats.quickWins}</p>
                      <p className="text-[11px] text-muted-foreground">missions rapides gagnées</p>
                    </div>
                  </div>
                  <Progress value={stats.level.pct} className="mt-3 h-2" />
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: <Wallet className="size-4" />, label: "Gagné", value: stats ? euros(stats.totalEarnedCents) : "—" },
                { icon: <Check className="size-4" />, label: "Missions finies", value: stats ? String(stats.missionsCompleted) : "—" },
                { icon: <CalendarCheck className="size-4" />, label: "Candidatures", value: stats ? String(stats.applicationsTotal) : "—" },
                { icon: <Star className="size-4" />, label: "Note moyenne", value: reputation?.average ? `${reputation.average}/5` : "—" },
              ].map((s) => (
                <Card key={s.label} className="card-shadow border-border/60">
                  <CardContent className="p-4">
                    <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">{s.icon}</span>
                    <p className="mt-2 font-display text-lg font-extrabold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Badges — earned + locked */}
            {stats && (
              <Card className="card-shadow border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 font-display text-base">
                    <Trophy className="size-4 text-amber-500" /> Badges ({stats.badges.length} débloqué{stats.badges.length > 1 ? "s" : ""})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.badges.length === 0 ? (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                      Aucun badge pour l'instant — termine ta première mission pour débloquer 🏅 Première mission !
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {stats.badges.map((b: any) => (
                        <span
                          key={b.id}
                          title={b.description}
                          className="flex items-center gap-1.5 rounded-full border border-coin/50 bg-coin/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-coin"
                        >
                          <span>{b.emoji}</span> {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {stats.badges.length > 0 && (
                    <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
                      🔒 Prochains badges : {stats.lockedBadges?.slice(0, 3).map((b: any) => `${b.emoji} ${b.label}`).join(" · ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Reviews */}
        <Card className="card-shadow border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <FileText className="size-4" /> Avis reçus ({reviews?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!reviews ? (
              <Skeleton className="h-16 rounded-xl" />
            ) : reviews.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucun avis pour l'instant. Termine une mission pour recevoir ta première évaluation ⭐
              </p>
            ) : (
              reviews.map((r: any) => (
                <div key={r._id} className="rounded-xl border p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {r.authorEmoji} {r.authorName}
                      <span className="ml-2 text-amber-500">{"⭐".repeat(r.rating)}</span>
                    </p>
                    <span className="text-[11px] text-muted-foreground">{formatDateShort(new Date(r.createdAt).toISOString().slice(0, 10))}</span>
                  </div>
                  {r.missionTitle && <p className="text-xs text-muted-foreground">« {r.missionTitle} »</p>}
                  {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier mon profil</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Avatar</Label>
                <div className="flex flex-wrap gap-2">
                  {AVATARS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAvatar(a)}
                      className={`grid size-10 place-items-center rounded-xl border text-xl ${avatar === a ? "border-primary bg-primary/10" : "border-border"}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pFirstName">Prénom</Label>
                <Input id="pFirstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={30} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pCity">Ville</Label>
                <Input id="pCity" value={city} onChange={(e) => setCity(e.target.value)} maxLength={40} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pBio">Présentation</Label>
                <Textarea id="pBio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={300} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
