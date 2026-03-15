/**
 * Parcel Detail Page [Part 10.4]
 * Shows full parcel info, immutable update timeline, dispatch controls, and POD.
 * Mobile-first: stacked layout, large touch targets.
 */

import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  AlertCircle,
  Camera,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { useI18n } from "@/contexts/I18nContext";
import { useTenantId } from "@/hooks/useTenantId";
import { formatKobo, formatWAT } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { PARCEL_STATUS } from "@shared/types";
import type { ParcelStatus } from "@/components/StatusBadge";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4" />,
  COLLECTED: <Package className="h-4 w-4" />,
  IN_TRANSIT: <Truck className="h-4 w-4" />,
  OUT_FOR_DELIVERY: <MapPin className="h-4 w-4" />,
  DELIVERED: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  FAILED: <AlertCircle className="h-4 w-4 text-red-600" />,
  RETURNED: <ArrowLeft className="h-4 w-4 text-orange-600" />,
};

export default function ParcelDetail() {
  const { trackingNumber } = useParams<{ trackingNumber: string }>();
  const { t, locale } = useI18n();
  const tenantId = useTenantId();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Update status dialog state
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<ParcelStatus>("IN_TRANSIT");
  const [updateLocation, setUpdateLocation] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");

  // POD dialog state
  const [podOpen, setPodOpen] = useState(false);
  const [podName, setPodName] = useState("");
  const [podRelation, setPodRelation] = useState("Self");
  const [podPhoto, setPodPhoto] = useState<string | undefined>();
  const [podSignature, setPodSignature] = useState<string | undefined>();

  const { data, isLoading, error } = trpc.parcels.getByTracking.useQuery(
    { tenantId, trackingNumber: trackingNumber ?? "" },
    { enabled: !!trackingNumber }
  );

  const addUpdateMutation = trpc.parcels.addUpdate.useMutation({
    onSuccess: () => {
      toast.success(t.success);
      setUpdateOpen(false);
      setUpdateLocation("");
      setUpdateNotes("");
      utils.parcels.getByTracking.invalidate({ tenantId, trackingNumber: trackingNumber ?? "" });
    },
    onError: err => toast.error(err.message || t.error),
  });

  const podMutation = trpc.parcels.submitPOD.useMutation({
    onSuccess: () => {
      toast.success(t.success);
      setPodOpen(false);
      utils.parcels.getByTracking.invalidate({ tenantId, trackingNumber: trackingNumber ?? "" });
    },
    onError: err => toast.error(err.message || t.error),
  });

  const dispatchMutation = trpc.parcels.dispatch.useMutation({
    onSuccess: () => {
      toast.success(t.success);
      utils.parcels.getByTracking.invalidate({ tenantId, trackingNumber: trackingNumber ?? "" });
    },
    onError: err => toast.error(err.message || t.error),
  });

  // Handle photo capture via file input
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      setPodPhoto(base64);
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">{t.parcelNotFound}</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/parcels")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  const { parcel, updates, pod } = data.data;
  const canDispatch = ["PENDING", "COLLECTED"].includes(parcel.status);
  const canUpdateStatus = !["DELIVERED", "RETURNED"].includes(parcel.status);
  const canSubmitPOD = parcel.status === "OUT_FOR_DELIVERY" && !pod;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/parcels")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-mono font-semibold text-primary">
              {parcel.trackingNumber}
            </h1>
            <StatusBadge status={parcel.status as ParcelStatus} />
          </div>
          <p className="text-xs text-muted-foreground">{formatWAT(parcel.createdAt, locale)}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {canDispatch && (
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() =>
              dispatchMutation.mutate({
                tenantId,
                parcelId: parcel.id,
                agentId: 1, // TODO: agent selection
              })
            }
            disabled={dispatchMutation.isPending}
          >
            <Truck className="h-4 w-4" />
            {t.dispatchAction}
          </Button>
        )}
        {canUpdateStatus && (
          <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2">
                <Clock className="h-4 w-4" />
                Update Status
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update Parcel Status</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>{t.status}</Label>
                  <Select
                    value={updateStatus}
                    onValueChange={val => setUpdateStatus(val as ParcelStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PARCEL_STATUS.map(s => (
                        <SelectItem key={s} value={s}>
                          {t[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t.address} / Location</Label>
                  <Input
                    value={updateLocation}
                    onChange={e => setUpdateLocation(e.target.value)}
                    placeholder="Current location (optional)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    value={updateNotes}
                    onChange={e => setUpdateNotes(e.target.value)}
                    placeholder="Additional notes..."
                    rows={2}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    addUpdateMutation.mutate({
                      tenantId,
                      parcelId: parcel.id,
                      status: updateStatus,
                      location: updateLocation || undefined,
                      notes: updateNotes || undefined,
                    })
                  }
                  disabled={addUpdateMutation.isPending}
                >
                  {addUpdateMutation.isPending ? t.loading : t.save}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {canSubmitPOD && (
          <Dialog open={podOpen} onOpenChange={setPodOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {t.submitPOD}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.proofOfDelivery}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>{t.receivedBy} *</Label>
                  <Input
                    value={podName}
                    onChange={e => setPodName(e.target.value)}
                    placeholder="Full name of recipient"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t.relation}</Label>
                  <Input
                    value={podRelation}
                    onChange={e => setPodRelation(e.target.value)}
                    placeholder="Self / Family / Neighbour..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    {t.capturePhoto}
                  </Label>
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                  />
                  {podPhoto && (
                    <p className="text-xs text-green-600">✓ Photo captured</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    <PenLine className="h-4 w-4" />
                    {t.captureSignature}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Signature capture canvas coming soon — digital signature pad integration.
                  </p>
                </div>
                <Button
                  className="w-full"
                  disabled={!podName || podMutation.isPending}
                  onClick={() =>
                    podMutation.mutate({
                      tenantId,
                      parcelId: parcel.id,
                      receivedByName: podName,
                      receivedByRelation: podRelation,
                      imageBase64: podPhoto,
                    })
                  }
                >
                  {podMutation.isPending ? t.loading : t.submitPOD}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Parcel Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t.sender}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pb-4">
          <p className="font-medium">{parcel.senderName}</p>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            {parcel.senderPhone}
          </p>
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {parcel.senderAddress}
          </p>
        </CardContent>
        <Separator />
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t.recipient}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pb-4">
          <p className="font-medium">{parcel.recipientName}</p>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            {parcel.recipientPhone}
          </p>
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {parcel.recipientAddress}
          </p>
          <p className="text-sm text-muted-foreground">
            {parcel.recipientCity}, {parcel.recipientState}
          </p>
        </CardContent>
        <Separator />
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t.deliveryFee}</p>
              <p className="font-semibold">
                {formatKobo(parcel.deliveryFeeKobo, parcel.currency, locale)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t.priority}</p>
              <p className="font-semibold">{t[parcel.priority as "STANDARD" | "EXPRESS" | "SAME_DAY"]}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t.weight}</p>
              <p className="font-semibold">{parcel.weightGrams}g</p>
            </div>
            {parcel.estimatedDeliveryAt && (
              <div>
                <p className="text-muted-foreground text-xs">{t.estimatedDelivery}</p>
                <p className="font-semibold">{formatWAT(parcel.estimatedDeliveryAt, locale)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Proof of Delivery */}
      {pod && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {t.proofOfDelivery}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <p className="text-sm">
              <span className="text-muted-foreground">{t.receivedBy}: </span>
              <span className="font-medium">{pod.receivedByName}</span>
              {pod.receivedByRelation && ` (${pod.receivedByRelation})`}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatWAT(pod.createdAt, locale)}
            </p>
            {pod.imageUrl && (
              <img
                src={pod.imageUrl}
                alt="Delivery photo"
                className="w-full max-w-xs rounded-lg mt-2"
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Update Timeline — immutable event log [Part 10.4] */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Tracking History
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noData}</p>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-4">
              {[...updates].reverse().map((update, idx) => (
                <li key={update.id} className="ml-4">
                  <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border">
                    {STATUS_ICONS[update.status] ?? <Clock className="h-3 w-3" />}
                  </span>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={update.status as ParcelStatus} />
                      {idx === 0 && (
                        <span className="text-xs text-muted-foreground">Latest</span>
                      )}
                    </div>
                    {update.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {update.location}
                      </p>
                    )}
                    {update.notes && (
                      <p className="text-sm text-foreground">{update.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatWAT(update.createdAt, locale)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
