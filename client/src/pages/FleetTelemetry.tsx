/**
 * Fleet Telemetry Dashboard
 * Phase 3: Real-time view of all active riders' GPS positions.
 * Shows a table of active riders with last-known location, speed, and status.
 * Auto-refreshes every 30 seconds.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantId } from "@/hooks/useTenantId";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bike,
  MapPin,
  RefreshCw,
  Navigation,
  Activity,
  Users,
  Clock,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(ms: number): string {
  const elapsed = Date.now() - ms;
  const mins = Math.floor(elapsed / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusColor(label: string): string {
  switch (label) {
    case "Active":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Idle":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Map View placeholder (Google Maps integration point)
// ─────────────────────────────────────────────────────────────────────────────

function RiderPinList({
  riders,
}: {
  riders: {
    userId: number;
    riderName: string | null;
    lat: number;
    lng: number;
    statusLabel: string;
    reportedAt: number;
  }[];
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
        <Navigation size={12} />
        Live coordinates — connect a Google Maps API key to render a full map
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {riders.map(r => (
          <a
            key={r.userId}
            href={`https://maps.google.com/?q=${r.lat},${r.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-background border hover:border-primary/50 transition-colors text-sm"
            data-testid={`rider-pin-${r.userId}`}
          >
            <span className={`w-2 h-2 rounded-full ${r.statusLabel === "Active" ? "bg-green-500" : "bg-yellow-500"} shrink-0`} />
            <div className="min-w-0">
              <p className="font-medium truncate">{r.riderName ?? `Rider #${r.userId}`}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
              </p>
            </div>
            <MapPin size={13} className="shrink-0 text-muted-foreground ml-auto" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function FleetTelemetry() {
  const tenantId = useTenantId();
  const [view, setView] = useState<"table" | "map">("table");

  const { data, isLoading, refetch, isFetching } = trpc.fleet.getActiveRiders.useQuery(
    { tenantId, staleAfterMinutes: 30 },
    { enabled: !!tenantId, refetchInterval: 30_000 },
  );

  const riders = data?.riders ?? [];
  const activeCount = riders.filter(r => r.statusLabel === "Active").length;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-fleet">
            Fleet Telemetry
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time rider positions · auto-refresh every 30s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              onClick={() => setView("table")}
              data-testid="tab-table"
            >
              Table
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "map" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              onClick={() => setView("map")}
              data-testid="tab-map"
            >
              Map
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-fleet"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3">
          <CardContent className="p-0 text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="stat-active-riders">
              {isLoading ? "–" : activeCount}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
              <Activity size={10} /> Active
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-0 text-center">
            <div className="text-2xl font-bold" data-testid="stat-total-riders">
              {isLoading ? "–" : riders.length}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
              <Users size={10} /> Reporting
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-0 text-center">
            <div className="text-2xl font-bold text-blue-600" data-testid="stat-geofenced">
              {isLoading ? "–" : riders.filter(r => r.speedKmh != null).length}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
              <Navigation size={10} /> w/ Speed
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2" data-testid="fleet-loading">
          <Skeleton className="h-10 w-full" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : riders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground" data-testid="fleet-empty">
          <Bike size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No active riders</p>
          <p className="text-xs mt-1">Riders appear here once they report their GPS position from the Driver App.</p>
        </div>
      ) : view === "table" ? (
        <Card data-testid="fleet-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Coordinates</TableHead>
                <TableHead>Speed</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riders.map(r => (
                <TableRow key={r.userId} data-testid={`row-rider-${r.userId}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${r.statusLabel === "Active" ? "bg-green-500" : "bg-yellow-500"}`} />
                      <div>
                        <p className="text-sm font-medium">{r.riderName ?? `Rider #${r.userId}`}</p>
                        <p className="text-xs text-muted-foreground">{r.riderEmail ?? `#${r.userId}`}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${statusColor(r.statusLabel)}`} data-testid={`badge-status-${r.userId}`}>
                      {r.statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs" data-testid={`text-coords-${r.userId}`}>
                      {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" data-testid={`text-speed-${r.userId}`}>
                      {r.speedKmh != null ? `${r.speedKmh.toFixed(1)} km/h` : "–"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-lastseen-${r.userId}`}>
                      <Clock size={11} />
                      {formatRelativeTime(r.reportedAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`https://maps.google.com/?q=${r.lat},${r.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary flex items-center gap-1 hover:underline"
                      data-testid={`link-map-${r.userId}`}
                    >
                      <MapPin size={11} /> View
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <RiderPinList
          riders={riders.map(r => ({
            userId: r.userId,
            riderName: r.riderName,
            lat: r.lat,
            lng: r.lng,
            statusLabel: r.statusLabel,
            reportedAt: r.reportedAt,
          }))}
        />
      )}
    </div>
  );
}
