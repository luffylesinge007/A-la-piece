import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { MissionCard } from "@/components/mission-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useNavigate } from "react-router";
import { Plus } from "lucide-react";

export default function MyMissions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTeen = user?.accountType === "teen";
  const missions = useQuery(api.missions.myMissions);
  const loading = missions === undefined;

  const byStatus = (status: string) => (missions ?? []).filter((m: any) => m.status === status);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Mes missions</h1>
          {!isTeen && (
            <Button asChild>
              <Link to="/missions/create"><Plus className="size-4" /> Publier</Link>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : (
          <Tabs defaultValue="published">
            <TabsList>
              <TabsTrigger value="published">Ouvertes ({byStatus("published").length})</TabsTrigger>
              <TabsTrigger value="assigned">Attribuées ({byStatus("assigned").length})</TabsTrigger>
              <TabsTrigger value="in_progress">En cours ({byStatus("in_progress").length})</TabsTrigger>
              <TabsTrigger value="completed">Terminées ({byStatus("completed").length})</TabsTrigger>
              <TabsTrigger value="cancelled">Annulées ({byStatus("cancelled").length})</TabsTrigger>
            </TabsList>
            {["published", "assigned", "in_progress", "completed", "cancelled"].map((status) => (
              <TabsContent key={status} value={status} className="mt-4">
                {byStatus(status).length === 0 ? (
                  <EmptyState
                    emoji={
                      status === "published" ? "📋" :
                      status === "assigned" ? "🤝" :
                      status === "in_progress" ? "🚀" :
                      status === "completed" ? "✅" : "🗑️"
                    }
                    title={
                      status === "published" ? "Aucune mission ouverte" :
                      status === "assigned" ? "Aucune mission attribuée" :
                      status === "in_progress" ? "Aucune mission en cours" :
                      status === "completed" ? "Aucune mission terminée" :
                      "Aucune mission annulée"
                    }
                    description={
                      status === "published"
                        ? isTeen
                          ? "Tu n'as pas encore publié de mission — et ce n'est pas ton rôle 😉 Explore plutôt celles qui t'attendent près de toi."
                          : "Publie ta première mission : décris ton besoin, choisis Rapide ou Vérifiée, et reçois tes premiers candidats."
                        : status === "assigned"
                          ? "Dès que tu acceptes un candidat (ou qu'un ado prend une mission rapide), elle atterrit ici."
                          : status === "in_progress"
                            ? "Le statut passe en « en cours » quand la mission démarre (check-in effectué)."
                            : status === "completed"
                              ? "Termine une mission pour la retrouver ici avec son paiement et son avis."
                              : "Les missions annulées apparaîtront ici."
                    }
                    actions={
                      status === "published" && !isTeen
                        ? [{ label: "➕ Publier ma première mission", to: "/missions/create" }]
                        : status === "published" && isTeen
                          ? [{ label: "🔍 Explorer les missions", to: "/missions", variant: "outline" }]
                          : undefined
                    }
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {byStatus(status).map((m: any) => (
                      <MissionCard key={m._id} mission={m} mine />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
