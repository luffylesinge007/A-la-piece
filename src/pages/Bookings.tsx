import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BOOKING_STATUS_META, PAYMENT_STATUS_META, eurosFromNumber, formatDateShort } from "@/lib/format";
import { Link } from "react-router";

export default function Bookings() {
  const bookings = useQuery(api.bookings.listMine);
  const loading = bookings === undefined;

  const active = (bookings ?? []).filter((b: any) => ["pending", "confirmed", "in_progress"].includes(b.status));
  const past = (bookings ?? []).filter((b: any) => ["completed", "cancelled", "disputed"].includes(b.status));

  const CardRow = ({ b }: { b: any }) => (
    <Card className="card-shadow border-border/60">
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <span className="grid size-11 place-items-center rounded-xl bg-secondary text-xl">
          {b.mission ? "📌" : "📌"}
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
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                    <span className="text-3xl">🗓️</span>
                    <p className="font-semibold">Aucune réservation active</p>
                    <p className="text-sm text-muted-foreground">
                      Une réservation apparaît ici dès qu'une candidature est acceptée.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                active.map((b: any) => <CardRow key={b._id} b={b} />)
              )}
            </TabsContent>
            <TabsContent value="past" className="mt-4 space-y-3">
              {past.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Rien dans l'historique pour l'instant.
                  </CardContent>
                </Card>
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
