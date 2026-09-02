import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { MissionCard } from "@/components/mission-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useNavigate } from "react-router";
import { Plus } from "lucide-react";

export default function MyMissions() {
  const navigate = useNavigate();
  const missions = useQuery(api.missions.myMissions);
  const loading = missions === undefined;

  const byStatus = (status: string) => (missions ?? []).filter((m: any) => m.status === status);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Mes missions</h1>
          <Button asChild>
            <Link to="/missions/create"><Plus className="size-4" /> Publier</Link>
          </Button>
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
                  <Card className="border-dashed">
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                      {status === "published" ? "Aucune mission ouverte — publie-en une !" : `Aucune mission ${status === "assigned" ? "attribuée" : status}.`}
                    </CardContent>
                  </Card>
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
