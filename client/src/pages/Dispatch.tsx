/**
 * T-LOG-03: Dispatch Dashboard
 * Geospatial order clustering UI for the WebWaka dispatch team.
 * Clusters unassigned PENDING parcels by geographic proximity and
 * allows bulk rider assignment per cluster.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantId } from "@/hooks/useTenantId";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  MapPin,
  Package,
  ChevronDown,
  ChevronRight,
  Users,
  Loader2,
  RefreshCw,
  Bike,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function koboToNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function gramsToKg(grams: number): string {
  return `${(grams / 1000).toFixed(2)} kg`;
}

const PRIORITY_COLOR: Record<string, string> = {
  EXPRESS: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  SAME_DAY: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  STANDARD: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const CLUSTER_COLORS = [
  "border-blue-400 bg-blue-50 dark:bg-blue-950",
  "border-purple-400 bg-purple-50 dark:bg-purple-950",
  "border-green-400 bg-green-50 dark:bg-green-950",
  "border-amber-400 bg-amber-50 dark:bg-amber-950",
  "border-rose-400 bg-rose-50 dark:bg-rose-950",
  "border-cyan-400 bg-cyan-50 dark:bg-cyan-950",
];

const CLUSTER_BADGE = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

// ─────────────────────────────────────────────────────────────────────────────
// Parcel row inside a cluster
// ─────────────────────────────────────────────────────────────────────────────
function ParcelRow({
  parcel,
  index,
}: {
  parcel: {
    id: number;
    trackingNumber: string;
    recipientName: string;
    recipientAddress: string;
    recipientCity: string;
    recipientState: string;
    recipientLat: number | null;
    recipientLng: number | null;
    priority: string;
    weightGrams: number;
    deliveryFeeKobo: number;
  };
  index: number;
}) {
  const hasCoords = parcel.recipientLat != null && parcel.recipientLng != null;
  return (
    <div
      className="flex items-start justify-between py-2.5 border-b last:border-0 gap-3"
      data-testid={`parcel-row-${parcel.id}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <span className="text-xs text-muted-foreground mt-0.5 shrink-0 font-mono w-4">
          {index + 1}.
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-xs font-mono text-primary font-medium"
              data-testid={`text-tracking-${parcel.id}`}
            >
              {parcel.trackingNumber}
            </span>
            <Badge
              className={`text-[10px] px-1.5 py-0 h-4 ${PRIORITY_COLOR[parcel.priority] ?? PRIORITY_COLOR.STANDARD}`}
              data-testid={`badge-priority-${parcel.id}`}
            >
              {parcel.priority}
            </Badge>
            {hasCoords && (
              <span
                className="text-[10px] text-green-600 dark:text-green-400"
                title={`${parcel.recipientLat?.toFixed(4)}, ${parcel.recipientLng?.toFixed(4)}`}
              >
                ● GPS
              </span>
            )}
          </div>
          <p className="text-sm font-medium truncate" data-testid={`text-recipient-${parcel.id}`}>
            {parcel.recipientName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {parcel.recipientAddress}, {parcel.recipientCity}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0 text-xs text-muted-foreground">
        <div>{gramsToKg(parcel.weightGrams)}</div>
        <div className="font-medium text-foreground">{koboToNaira(parcel.deliveryFeeKobo)}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single cluster card
// ─────────────────────────────────────────────────────────────────────────────
function ClusterCard({
  cluster,
  colorIndex,
  agents,
  onAssign,
  isAssigning,
}: {
  cluster: {
    key: string;
    label: string;
    shortLabel: string;
    strategy: "coordinate" | "text";
    centroid: { lat: number | null; lng: number | null };
    parcelCount: number;
    totalFeeKobo: number;
    totalWeightGrams: number;
    parcels: {
      id: number;
      trackingNumber: string;
      recipientName: string;
      recipientAddress: string;
      recipientCity: string;
      recipientState: string;
      recipientLat: number | null;
      recipientLng: number | null;
      priority: string;
      weightGrams: number;
      deliveryFeeKobo: number;
    }[];
  };
  colorIndex: number;
  agents: { id: number; name: string | null; email: string | null; role: string }[];
  onAssign: (parcelIds: number[], agentId: number) => void;
  isAssigning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  const colorClass = CLUSTER_COLORS[colorIndex % CLUSTER_COLORS.length];
  const badgeClass = CLUSTER_BADGE[colorIndex % CLUSTER_BADGE.length];
  const parcelIds = cluster.parcels.map(p => p.id);
  const hasExpress = cluster.parcels.some(
    p => p.priority === "EXPRESS" || p.priority === "SAME_DAY",
  );

  const handleAssign = () => {
    if (!selectedAgent) return;
    onAssign(parcelIds, parseInt(selectedAgent, 10));
  };

  return (
    <Card
      className={`border-l-4 ${colorClass} transition-shadow hover:shadow-md`}
      data-testid={`cluster-card-${cluster.shortLabel}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`${badgeClass} text-white text-xs font-bold px-2 py-1 rounded-full min-w-[28px] text-center`}
              data-testid={`badge-cluster-${cluster.shortLabel}`}
            >
              {cluster.shortLabel}
            </span>
            <div>
              <CardTitle className="text-base leading-tight" data-testid={`text-cluster-label-${cluster.shortLabel}`}>
                {cluster.label}
              </CardTitle>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Package size={11} />
                  {cluster.parcelCount} parcel{cluster.parcelCount !== 1 ? "s" : ""}
                </span>
                {cluster.strategy === "coordinate" ? (
                  <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <MapPin size={11} />
                    GPS clustered
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400">City grouped</span>
                )}
                {hasExpress && (
                  <span className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    <AlertTriangle size={11} />
                    Priority
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div className="font-medium text-foreground text-sm">
              {koboToNaira(cluster.totalFeeKobo)}
            </div>
            <div>{gramsToKg(cluster.totalWeightGrams)}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Assign rider row */}
        <div className="flex items-center gap-2 flex-wrap" data-testid={`assign-row-${cluster.shortLabel}`}>
          <Select
            value={selectedAgent}
            onValueChange={setSelectedAgent}
            data-testid={`select-agent-${cluster.shortLabel}`}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-[160px]">
              <SelectValue placeholder="Select rider…" />
            </SelectTrigger>
            <SelectContent>
              {agents.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No agents available
                </SelectItem>
              ) : (
                agents.map(agent => (
                  <SelectItem
                    key={agent.id}
                    value={String(agent.id)}
                    data-testid={`option-agent-${agent.id}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Bike size={12} />
                      {agent.name ?? agent.email ?? `Agent #${agent.id}`}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!selectedAgent || isAssigning}
            onClick={handleAssign}
            data-testid={`button-assign-${cluster.shortLabel}`}
          >
            {isAssigning ? (
              <Loader2 size={12} className="animate-spin mr-1" />
            ) : (
              <CheckCircle2 size={12} className="mr-1" />
            )}
            Assign
          </Button>
        </div>

        {/* Expandable parcel list */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            data-testid={`toggle-parcels-${cluster.shortLabel}`}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? "Hide" : "Show"} {cluster.parcelCount} parcel
            {cluster.parcelCount !== 1 ? "s" : ""}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="border rounded-md bg-background px-3">
              {cluster.parcels.map((parcel, i) => (
                <ParcelRow key={parcel.id} parcel={parcel} index={i} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function Dispatch() {
  const tenantId = useTenantId();
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: clusterData,
    isLoading: clustersLoading,
    refetch: refetchClusters,
  } = trpc.dispatch.getClusters.useQuery({ tenantId }, { enabled: !!tenantId });

  const { data: summaryData } = trpc.dispatch.getSummary.useQuery(
    { tenantId },
    { enabled: !!tenantId },
  );

  const { data: agentsData } = trpc.dispatch.getAgents.useQuery();

  const assignMutation = trpc.dispatch.assignCluster.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Assigned ${vars.parcelIds.length} parcel${vars.parcelIds.length !== 1 ? "s" : ""} to rider`);
      queryClient.invalidateQueries({ queryKey: ["/api/trpc/dispatch.getClusters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trpc/dispatch.getSummary"] });
      setAssigningKey(null);
    },
    onError: err => {
      toast.error(err.message ?? "Failed to assign cluster");
      setAssigningKey(null);
    },
  });

  const clusters = clusterData?.clusters ?? [];
  const agents = agentsData ?? [];
  const summary = summaryData;

  const handleAssign = (clusterKey: string, parcelIds: number[], agentId: number) => {
    setAssigningKey(clusterKey);
    assignMutation.mutate({ tenantId, parcelIds, agentId });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-dispatch">
            Dispatch Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Parcels grouped by delivery zone — assign riders per cluster
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchClusters()}
          disabled={clustersLoading}
          data-testid="button-refresh-clusters"
        >
          <RefreshCw size={14} className={`mr-1.5 ${clustersLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Summary stats ────────────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-3 gap-3" data-testid="dispatch-summary">
          <Card className="py-3">
            <CardContent className="p-0 text-center">
              <div
                className="text-2xl font-bold text-orange-600"
                data-testid="stat-unassigned"
              >
                {summary.totalUnassigned}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Unassigned</div>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="p-0 text-center">
              <div className="text-2xl font-bold" data-testid="stat-pending">
                {summary.totalPending}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Pending</div>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="p-0 text-center">
              <div
                className="text-2xl font-bold text-blue-600"
                data-testid="stat-in-transit"
              >
                {summary.totalInTransit}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">In Transit</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Agents notice ────────────────────────────────────────────── */}
      {!clustersLoading && agents.length === 0 && (
        <div
          className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3"
          data-testid="notice-no-agents"
        >
          <Users size={14} />
          No agents found with agent or admin role. Add riders to the system before assigning.
        </div>
      )}

      {/* ── Cluster list ─────────────────────────────────────────────── */}
      {clustersLoading ? (
        <div className="space-y-3" data-testid="clusters-loading">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : clusters.length === 0 ? (
        <div
          className="text-center py-16 text-muted-foreground"
          data-testid="clusters-empty"
        >
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No unassigned parcels</p>
          <p className="text-xs mt-1">All PENDING parcels have been assigned to riders.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="clusters-list">
          <p className="text-xs text-muted-foreground">
            {clusters.length} cluster{clusters.length !== 1 ? "s" : ""} ·{" "}
            {clusters.reduce((s, c) => s + c.parcelCount, 0)} parcels total
          </p>
          {clusters.map((cluster, i) => (
            <ClusterCard
              key={cluster.key}
              cluster={cluster}
              colorIndex={i}
              agents={agents}
              isAssigning={assigningKey === cluster.key && assignMutation.isPending}
              onAssign={(parcelIds, agentId) => handleAssign(cluster.key, parcelIds, agentId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
