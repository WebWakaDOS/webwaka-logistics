/**
 * RiderApplications.tsx — T-LOG-05
 * Admin view: list and manage all rider KYC applications for the tenant.
 */

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useTenantId } from "@/hooks/useTenantId";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Clock, RotateCcw, Users, XCircle } from "lucide-react";
import type { Rider } from "../../../drizzle/schema";
import { RIDER_KYC_STATUS } from "../../../drizzle/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Status badge helper
// ─────────────────────────────────────────────────────────────────────────────

type KycStatus = (typeof RIDER_KYC_STATUS)[number];

const STATUS_BADGE: Record<
  KycStatus,
  { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  PENDING: { variant: "secondary", icon: <Clock className="h-3 w-3 mr-1" /> },
  VERIFYING: { variant: "secondary", icon: <Clock className="h-3 w-3 mr-1" /> },
  ACTIVE: { variant: "default", icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
  REJECTED: { variant: "destructive", icon: <XCircle className="h-3 w-3 mr-1" /> },
};

function KycBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status as KycStatus] ?? STATUS_BADGE.PENDING;
  return (
    <Badge
      variant={cfg.variant}
      className="flex items-center w-fit"
      data-testid={`badge-kyc-${status}`}
    >
      {cfg.icon}
      {status}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function RiderApplications() {
  const tenantId = useTenantId();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<KycStatus | "ALL">("ALL");

  const { data: riders = [], isLoading } = trpc.riders.listApplications.useQuery({
    tenantId,
    ...(statusFilter !== "ALL" ? { kycStatus: statusFilter } : {}),
  });

  const retriggerMutation = trpc.riders.retriggerKyc.useMutation({
    onSuccess: () => {
      utils.riders.listApplications.invalidate();
      toast.success("KYC re-triggered", {
        description: "Verification request has been re-sent.",
      });
    },
    onError: (err) => {
      toast.error("Re-trigger failed", { description: err.message });
    },
  });

  // Counts from the current unfiltered data (always show all-status counts)
  const { data: allRiders = [] } = trpc.riders.listApplications.useQuery({ tenantId });

  const counts = RIDER_KYC_STATUS.reduce(
    (acc, s) => {
      acc[s] = allRiders.filter((r: Rider) => r.kycStatus === s).length;
      return acc;
    },
    {} as Record<KycStatus, number>,
  );

  return (
    <div className="space-y-6" data-testid="rider-applications">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Rider Applications
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            KYC verification status for all gig rider applications
          </p>
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as KycStatus | "ALL")}
        >
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {RIDER_KYC_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {RIDER_KYC_STATUS.map((s) => (
          <Card
            key={s}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setStatusFilter(s)}
          >
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s}</p>
              <p className="text-2xl font-bold mt-1" data-testid={`count-${s}`}>
                {counts[s]}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Applications table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Applications {statusFilter !== "ALL" ? `— ${statusFilter}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : riders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No rider applications found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>KYC Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riders.map((rider: Rider) => (
                  <TableRow key={rider.id} data-testid={`row-rider-${rider.id}`}>
                    <TableCell
                      className="font-medium"
                      data-testid={`text-rider-name-${rider.id}`}
                    >
                      {rider.fullName}
                    </TableCell>
                    <TableCell>{rider.phone}</TableCell>
                    <TableCell>{rider.vehicleType}</TableCell>
                    <TableCell>{rider.plateNumber}</TableCell>
                    <TableCell>
                      <KycBadge status={rider.kycStatus} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {rider.submittedAt
                        ? new Date(rider.submittedAt).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {(rider.kycStatus === "PENDING" || rider.kycStatus === "REJECTED") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          data-testid={`button-retrigger-${rider.id}`}
                          onClick={() =>
                            retriggerMutation.mutate({ tenantId, riderId: rider.id })
                          }
                          disabled={retriggerMutation.isPending}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Re-trigger KYC
                        </Button>
                      )}
                      {rider.kycStatus === "REJECTED" && rider.rejectionReason && (
                        <p
                          className="text-xs text-destructive mt-1 max-w-[200px] truncate"
                          title={rider.rejectionReason}
                          data-testid={`text-rejection-reason-${rider.id}`}
                        >
                          {rider.rejectionReason}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
