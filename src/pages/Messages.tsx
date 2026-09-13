import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { eurosFromNumber, formatDateShort, friendlyError, formatDateTime } from "@/lib/format";
import { DataIcon, ProfileAvatar } from "@/components/icons";
import { ArrowLeft, Ban, Cog, Flag, HandMetal, HelpCircle, MessagesSquare, PartyPopper, Search, Send, ShieldCheck, Smile, ThumbsUp, Timer, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PawPrint, CheckCircle2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Quick-reply pictograms (Lucide) — replaces emoji shortcuts. */
const QUICK_REPLIES: { id: string; icon: LucideIcon; label: string }[] = [
  { id: "Merci !", icon: ThumbsUp, label: "Merci" },
  { id: "Je serai là à l'heure.", icon: Timer, label: "À l'heure" },
  { id: "C'est noté !", icon: PartyPopper, label: "C'est noté" },
  { id: "À tout à l'heure.", icon: Smile, label: "À tout de suite" },
  { id: "Je m'occupe des animaux avec plaisir.", icon: PawPrint, label: "Animaux" },
  { id: "Question : quel jour exactement ?", icon: HelpCircle, label: "Question" },
  { id: "C'est confirmé.", icon: CheckCircle2, label: "Confirmé" },
  { id: "Pouvez-vous préciser ?", icon: HandMetal, label: "Préciser" },
];

export default function Messages() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const conversations = useQuery(api.chat.listConversations);
  const messages = useQuery(
    api.chat.listMessages,
    id ? { conversationId: id as any } : "skip",
  );

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendMessage = useMutation(api.chat.sendMessage);
  const submitReport = useMutation(api.safety.submitReport);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const handleSend = async () => {
    if (!draft.trim() || !id) return;
    setSending(true);
    try {
      await sendMessage({ conversationId: id as any, body: draft.trim() });
      setDraft("");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSending(false);
    }
  };

  const handleReport = async () => {
    if (!reportReason.trim() || !id) return;
    try {
      await submitReport({
        targetType: "message",
        targetId: id,
        reason: reportReason.trim(),
      });
      toast.success("Signalement envoyé — notre équipe va examiner la conversation.");
      setReportOpen(false);
      setReportReason("");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const activeConv = conversations?.find((c: any) => c._id === id);

  return (
    <AppShell>
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <div className={cn("space-y-3", id && "hidden lg:block")}>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Messages</h1>
          {!conversations ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare className="size-7" />}
              title="Tes conversations apparaîtront ici"
              description={
                user?.accountType === "teen"
                  ? "Dès qu'une de tes candidatures est acceptée — ou que tu prends une mission rapide — tu pourras discuter avec la personne concernée."
                  : "Dès qu'un candidat est accepté sur une de tes missions, vous pourrez échanger ici."
              }
              actions={
                user?.accountType === "teen"
                  ? [{ label: "Explorer les missions", to: "/missions" }]
                  : [{ label: "Publier une mission", to: "/missions/create" }]
              }
            />
          ) : (
            conversations.map((c: any) => (
              <button
                key={c._id}
                onClick={() => navigate(`/messages/${c._id}`)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent",
                  id === c._id && "border-primary bg-primary/5",
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                  <ProfileAvatar icon={c.counterpart?.avatarIcon} name={c.counterpart?.firstName} iconClassName="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.counterpart?.firstName}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(c.lastMessageAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.missionTitle ? `« ${c.missionTitle} » · ` : ""}{c.lastMessagePreview}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        {/* Chat view */}
        {id && (
          <Card className="card-shadow flex h-[calc(100vh-11rem)] flex-col border-border/60 lg:h-[calc(100vh-8.5rem)]">
            <div className="flex items-center justify-between border-b p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => navigate("/messages")}>
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <p className="truncate font-display font-bold">
                    {activeConv?.counterpart?.firstName ?? "Conversation"}
                  </p>
                  {activeConv?.missionTitle && (
                    <p className="truncate text-xs text-muted-foreground">
                      Mission : « {activeConv.missionTitle} »
                      {activeConv.missionDate
                        ? ` · ${formatDateShort(activeConv.missionDate)}${activeConv.missionTime ? ` à ${activeConv.missionTime}` : ""}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                {activeConv?.missionId && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/missions/${activeConv.missionId}`}>Voir la mission</Link>
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setReportOpen(true)} aria-label="Signaler">
                  <Flag className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Bloquer (bientôt disponible)"
                  onClick={() => toast.info("Le blocage complet arrive dans la V2 — en attendant, signale la conversation.")}
                >
                  <Ban className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {!messages ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-2/3 rounded-xl" />)}</div>
              ) : messages.length === 0 ? (
                <p className="pt-10 text-center text-sm text-muted-foreground">
                  Démarre la conversation — présente-toi brièvement.
                </p>
              ) : (
                messages.map((m: any) => (
                  <div
                    key={m._id}
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                      m.type === "system"
                        ? "mx-auto bg-muted text-center text-xs text-muted-foreground"
                        : m.senderId === user?._id
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {m.type === "system" ? (
                      <span className="inline-flex items-center gap-1.5"><Cog className="size-3" /> {m.body}</span>
                    ) : (
                      m.body
                    )}
                    <span className={cn("mt-0.5 block text-[10px]", m.type === "system" ? "" : m.senderId === user?._id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {formatDateTime(m.createdAt)}
                    </span>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="space-y-2 border-t p-3">
              <div className="flex gap-1 overflow-x-auto">
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q.id}
                    className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => setDraft(q.id)}
                    aria-label={`Insérer : ${q.label}`}
                  >
                    <q.icon className="size-3" /> {q.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Écris un message…"
                  maxLength={2000}
                />
                <Button size="icon" onClick={handleSend} disabled={sending || !draft.trim()} aria-label="Envoyer">
                  <Send className="size-4" />
                </Button>
              </div>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3 text-emerald-500" /> Le partage de téléphone, email ou adresse est bloqué automatiquement.
              </p>
            </div>
          </Card>
        )}

        {/* Report dialog */}
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Signaler la conversation</DialogTitle>
              <DialogDescription>
                Notre équipe de modération sera notifiée et pourra examiner les messages.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Que se passe-t-il ? (insultes, harcèlement, demande d'argent…)"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReportOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleReport} disabled={!reportReason.trim()}>
                <Flag className="size-4" /> Signaler
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
