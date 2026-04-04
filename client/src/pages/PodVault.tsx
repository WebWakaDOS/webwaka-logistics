/**
 * POD Vault — Proof of Delivery Records Browser
 * Phase 1 (POD Vault): Securely browse all delivery photos and signatures
 * across the tenant. Admin/staff view with pagination and photo lightbox.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantId } from "@/hooks/useTenantId";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Package,
  User,
  MapPin,
  Calendar,
  ImageOff,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// POD Record Card
// ─────────────────────────────────────────────────────────────────────────────

type PodRecord = {
  id: number;
  parcelId: number;
  trackingNumber: string | null;
  recipientName: string | null;
  recipientAddress: string | null;
  recipientCity: string | null;
  receivedByName: string;
  receivedByRelation: string;
  imageUrl: string | null;
  signatureUrl: string | null;
  createdAt: Date | null;
};

function PodCard({
  record,
  onView,
}: {
  record: PodRecord;
  onView: (record: PodRecord) => void;
}) {
  const hasMedia = record.imageUrl || record.signatureUrl;

  return (
    <Card
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onView(record)}
      data-testid={`pod-card-${record.id}`}
    >
      {/* Photo thumbnail */}
      <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
        {record.imageUrl ? (
          <img
            src={record.imageUrl}
            alt={`POD for ${record.trackingNumber}`}
            className="w-full h-full object-cover"
            data-testid={`img-pod-${record.id}`}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <ImageOff size={28} />
            <span className="text-xs">No photo</span>
          </div>
        )}
      </div>

      <CardContent className="p-3 space-y-2">
        {/* Tracking number */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="font-mono text-sm font-semibold text-primary truncate"
            data-testid={`text-tracking-${record.id}`}
          >
            {record.trackingNumber ?? `Parcel #${record.parcelId}`}
          </span>
          <div className="flex gap-1 shrink-0">
            {record.imageUrl && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-800">Photo</Badge>
            )}
            {record.signatureUrl && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-purple-100 text-purple-800">Sig</Badge>
            )}
          </div>
        </div>

        {/* Recipient */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User size={11} />
          <span className="truncate" data-testid={`text-received-by-${record.id}`}>
            Received by {record.receivedByName}
            {record.receivedByRelation !== "Self" ? ` (${record.receivedByRelation})` : ""}
          </span>
        </div>

        {/* Address */}
        {record.recipientCity && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin size={11} />
            <span className="truncate">{record.recipientCity}</span>
          </div>
        )}

        {/* Date */}
        {record.createdAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar size={11} />
            <span data-testid={`text-date-${record.id}`}>
              {format(new Date(record.createdAt), "d MMM yyyy, HH:mm")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POD Lightbox
// ─────────────────────────────────────────────────────────────────────────────

function PodLightbox({
  record,
  open,
  onClose,
}: {
  record: PodRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!record) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" data-testid="pod-lightbox">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {record.trackingNumber ?? `Parcel #${record.parcelId}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Delivery photo */}
          {record.imageUrl && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Camera size={11} /> Delivery Photo
              </p>
              <img
                src={record.imageUrl}
                alt="Proof of delivery photo"
                className="w-full rounded-lg border object-contain max-h-96"
                data-testid="img-lightbox-photo"
              />
            </div>
          )}

          {/* Signature */}
          {record.signatureUrl && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <ShieldCheck size={11} /> Customer Signature
              </p>
              <img
                src={record.signatureUrl}
                alt="Customer signature"
                className="w-full max-h-32 object-contain rounded-lg border bg-white"
                data-testid="img-lightbox-signature"
              />
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm border rounded-md p-3 bg-muted/30">
            <div>
              <p className="text-xs text-muted-foreground">Received By</p>
              <p className="font-medium">{record.receivedByName}</p>
              <p className="text-xs text-muted-foreground">{record.receivedByRelation}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recipient</p>
              <p className="font-medium truncate">{record.recipientName ?? "–"}</p>
              <p className="text-xs text-muted-foreground truncate">{record.recipientAddress ?? ""}</p>
            </div>
            {record.createdAt && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="font-medium">{format(new Date(record.createdAt), "d MMMM yyyy 'at' HH:mm")}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

export default function PodVault() {
  const tenantId = useTenantId();
  const [page, setPage] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<PodRecord | null>(null);

  const { data, isLoading } = trpc.parcels.listPODs.useQuery(
    { tenantId, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { enabled: !!tenantId },
  );

  const records = (data?.data ?? []) as PodRecord[];

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-pod-vault">
            POD Vault
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tamper-evident proof-of-delivery records — photos & signatures
          </p>
        </div>
        <Badge
          className="bg-blue-100 text-blue-800 text-sm px-3 py-1"
          data-testid="badge-pod-count"
        >
          <ShieldCheck size={13} className="mr-1.5" />
          {isLoading ? "…" : records.length} records
        </Badge>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" data-testid="pod-loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground" data-testid="pod-empty">
          <Camera size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No POD records yet</p>
          <p className="text-xs mt-1">Delivery photos and signatures appear here once riders submit proof of delivery.</p>
        </div>
      ) : (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
          data-testid="pod-grid"
        >
          {records.map(r => (
            <PodCard key={r.id} record={r} onView={setSelectedRecord} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {records.length > 0 && (
        <div className="flex items-center justify-center gap-3" data-testid="pod-pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            data-testid="button-prev-page"
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={records.length < PAGE_SIZE}
            onClick={() => setPage(p => p + 1)}
            data-testid="button-next-page"
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {/* Lightbox */}
      <PodLightbox
        record={selectedRecord}
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
