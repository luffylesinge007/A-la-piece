import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BOOKING_STATUS_META, PAYMENT_STATUS_META, eurosFromNumber, formatDateShort } from "@/lib/format";
import { CategorySlugIcon } from "@/components/icons";
import { CalendarRange, FilePlus2, Search, ScrollText } from "lucide-react";
import { Link } from "react-router";

export default function Bookings() {
  const { user } = useAuth();
  const isTeen = user?.accountType === "teen";
  const bookings = useQuery(api.bookings.listMine);
  const loading = bookings === undefined;

  const active = (bookings ?? []).filter((b: any) => ["pending", "confirmed", "in_progress"].includes(b.status));
  const past = (bookings ?? []).filter((b: any) => ["completed", "cancelled", "disputed"].includes(b.status));

  const CardRow = ({ b }: { b: any }) => (
    <Card className="card-shadow border-border/60">
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
          <CategorySlugIcon slug={b.mission?.categorySlug} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{b.mission?.title ?? "Mission"}</p>
            <Badge variant="secondary" className={BOOKING_STATUS_META[b.status]?.className}>
              {BOOKING_STATUS_META[b.status]?.label}
            </Badge>
            {b.paymentStatus && (
              <Badge variant="outline" className={PAYMENT_STATUS_META[b.paymentStatus]?.className}>
                {PAYMENT_STATUS_META[b.paymentStatus]?.label}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {b.role === "teen" ? "En tant qu'ado" : "En tant qu'adulte"} · {b.counterpart?.firstName} ·{" "}
            {b.mission ? `${formatDateShort(b.mission.scheduledDate)} · ${b.mission.scheduledTime}` : ""} ·{" "}
            {eurosFromNumber(b.priceEuros)}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link to={`/reservations/${b._id}`}>Ouvrir</Link>
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Réservations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Le suivi complet de tes missions, avec l'état du paiement.</p>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : (
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Actives ({active.length})</TabsTrigger>
              <TabsTrigger value="past">Historique ({past.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4 space-y-3">
              {active.length === 0 ? (
                <EmptyState
                  icon={<CalendarRange className="size-7" />}
                  title="Aucune réservation active"
                  description={
                    isTeen
                      ? "Dès qu'un adulte accepte ta candidature (ou que tu prends une mission rapide), elle apparaîtra ici."
                      : "Dès qu'un candidat est accepté sur une de tes missions, la réservation s'affichera ici avec son état de paiement."
                  }
                  actions={
                    isTeen
                      ? [{ label: "Explorer les missions", to: "/missions" }]
                      : [{ label: "Publier une mission", to: "/missions/create" }]
                  }
                />
              ) : (
                active.map((b: any) => <CardRow key={b._id} b={b} />)
              )}
            </TabsContent>
            <TabsContent value="past" className="mt-4 space-y-3">
              {past.length === 0 ? (
                <EmptyState
                  icon={<ScrollText className="size-6" />}
                  title="Rien dans l'historique"
                  description={
                    isTeen
                      ? "Tes missions terminées et tes paiements validés seront archivés ici."
                      : "Tes missions terminées et tes dépenses seront archivées ici."
                  }
                  variant="subtle"
                />
              ) : (
                past.map((b: any) => <CardRow key={b._id} b={b} />)
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
