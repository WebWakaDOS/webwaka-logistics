/**
 * Driver App — Offline-First Delivery Workflow
 * Phase 1: Offline-First Driver App with Dexie.js mutation queue.
 * Riders can view their assigned parcels, mark OUT_FOR_DELIVERY, verify OTP,
 * capture POD photos, and submit delivery — all while offline.
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantId } from "@/hooks/useTenantId";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Package,
  MapPin,
  Phone,
  CheckCircle2,
  Camera,
  Loader2,
  Wifi,
  WifiOff,
  Navigation,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { CameraPOD } from "@/components/CameraPOD";
import {
  enqueueMutation,
  getCachedOtpToken,
  verifyOtpOffline,
  cacheOfflineOtpToken,
} from "@/lib/offlineDb";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Assigned", color: "bg-slate-100 text-slate-700" },
  COLLECTED: { label: "Collected", color: "bg-blue-100 text-blue-800" },
  IN_TRANSIT: { label: "In Transit", color: "bg-purple-100 text-purple-800" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", color: "bg-orange-100 text-orange-800" },
  DELIVERED: { label: "Delivered", color: "bg-green-100 text-green-800" },
  FAILED: { label: "Failed", color: "bg-red-100 text-red-800" },
  RETURNED: { label: "Returned", color: "bg-yellow-100 text-yellow-800" },
};

const ACTIVE_STATUSES = ["PENDING", "COLLECTED", "IN_TRANSIT", "OUT_FOR_DELIVERY"];

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function useGeolocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return coords;
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP Panel
// ─────────────────────────────────────────────────────────────────────────────

function OtpPanel({
  parcel,
  tenantId,
  onVerified,
}: {
  parcel: { id: number; trackingNumber: string; status: string; otpVerifiedAt: Date | null };
  tenantId: string;
  onVerified: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const isOnline = useOnlineStatus();

  const verifyMutation = trpc.parcels.verifyOtp.useMutation({
    onSuccess: () => {
      toast.success("OTP verified — you can now submit proof of delivery");
      onVerified();
    },
    onError: err => toast.error(err.message ?? "Invalid OTP"),
  });

  const requestOtpMutation = trpc.parcels.requestOtp.useMutation({
    onSuccess: async data => {
      toast.success("New OTP sent to customer");
      if (data.otpOfflineToken) {
        await cacheOfflineOtpToken(parcel.id, parcel.trackingNumber, data.otpOfflineToken, Date.now() + 10 * 60 * 1000);
      }
    },
    onError: err => toast.error(err.message ?? "Failed to send OTP"),
  });

  const handleVerify = async () => {
    if (otp.length !== 4) return;
    setVerifying(true);
    try {
      if (isOnline) {
        verifyMutation.mutate({ tenantId, parcelId: parcel.id, otpCode: otp });
      } else {
        const cached = await getCachedOtpToken(parcel.id);
        if (!cached) {
          toast.error("No offline OTP available. Connect to verify.");
          return;
        }
        const ok = await verifyOtpOffline(parcel.id, otp, cached.offlineToken);
        if (ok) {
          await enqueueMutation("parcels.verifyOtp", { tenantId, parcelId: parcel.id, otpCode: otp });
          toast.success("OTP verified offline — will confirm when reconnected");
          onVerified();
        } else {
          toast.error("Invalid OTP");
        }
      }
    } finally {
      setVerifying(false);
    }
  };

  if (parcel.otpVerifiedAt) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-2.5" data-testid={`otp-verified-${parcel.id}`}>
        <CheckCircle2 size={15} />
        OTP verified
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid={`otp-panel-${parcel.id}`}>
      <Label className="text-xs font-medium">Customer OTP</Label>
      <div className="flex gap-2">
        <Input
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="4-digit OTP"
          className="w-28 font-mono text-center text-lg h-9"
          maxLength={4}
          data-testid={`input-otp-${parcel.id}`}
        />
        <Button
          size="sm"
          className="h-9"
          disabled={otp.length !== 4 || verifying || verifyMutation.isPending}
          onClick={handleVerify}
          data-testid={`button-verify-otp-${parcel.id}`}
        >
          {verifying || verifyMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : "Verify"}
        </Button>
        {isOnline && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs"
            disabled={requestOtpMutation.isPending}
            onClick={() => requestOtpMutation.mutate({ tenantId, parcelId: parcel.id })}
            data-testid={`button-resend-otp-${parcel.id}`}
          >
            Resend
          </Button>
        )}
      </div>
      {!isOnline && (
        <p className="text-xs text-amber-600">Offline: using cached token for verification</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Parcel delivery card
// ─────────────────────────────────────────────────────────────────────────────

function DeliveryCard({
  parcel,
  tenantId,
  riderCoords,
  onRefresh,
}: {
  parcel: {
    id: number;
    trackingNumber: string;
    status: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    recipientCity: string;
    recipientState: string;
    recipientLat: number | null;
    recipientLng: number | null;
    priority: string;
    otpVerifiedAt: Date | null;
    deliveryFeeKobo: number;
  };
  tenantId: string;
  riderCoords: { lat: number; lng: number } | null;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showPODForm, setShowPODForm] = useState(false);
  const [otpVerified, setOtpVerified] = useState(!!parcel.otpVerifiedAt);
  const [receivedByName, setReceivedByName] = useState(parcel.recipientName);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const isOnline = navigator.onLine;
  const statusInfo = STATUS_LABELS[parcel.status] ?? STATUS_LABELS["PENDING"];
  const isActive = ACTIVE_STATUSES.includes(parcel.status);

  const addUpdateMutation = trpc.parcels.addUpdate.useMutation({
    onSuccess: data => {
      toast.success(`Parcel marked as Out for Delivery`);
      if (data.otpOfflineToken) {
        cacheOfflineOtpToken(parcel.id, parcel.trackingNumber, data.otpOfflineToken, Date.now() + 10 * 60 * 1000);
      }
      onRefresh();
    },
    onError: err => toast.error(err.message ?? "Failed to update status"),
  });

  const submitPODMutation = trpc.parcels.submitPOD.useMutation({
    onSuccess: () => {
      toast.success("Proof of delivery submitted successfully");
      setShowPODForm(false);
      onRefresh();
    },
    onError: err => toast.error(err.message ?? "Failed to submit POD"),
  });

  const handleMarkOutForDelivery = () => {
    if (!isOnline) {
      enqueueMutation("parcels.addUpdate", {
        tenantId,
        parcelId: parcel.id,
        status: "OUT_FOR_DELIVERY",
        latitude: riderCoords?.lat?.toString(),
        longitude: riderCoords?.lng?.toString(),
        notes: "Rider en route to delivery address",
      });
      toast.success("Queued — will sync when online");
      return;
    }
    addUpdateMutation.mutate({
      tenantId,
      parcelId: parcel.id,
      status: "OUT_FOR_DELIVERY",
      latitude: riderCoords?.lat?.toString(),
      longitude: riderCoords?.lng?.toString(),
      notes: "Rider en route to delivery address",
    });
  };

  const handleSubmitPOD = () => {
    submitPODMutation.mutate({
      tenantId,
      parcelId: parcel.id,
      receivedByName,
      receivedByRelation: "Self",
      imageBase64: capturedPhoto ?? undefined,
    });
  };

  if (!isActive) return null;

  return (
    <Card
      className={`border transition-shadow hover:shadow-md ${parcel.status === "OUT_FOR_DELIVERY" ? "border-orange-300" : ""}`}
      data-testid={`delivery-card-${parcel.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-primary" data-testid={`text-tracking-${parcel.id}`}>
                {parcel.trackingNumber}
              </span>
              <Badge className={`text-[10px] px-1.5 py-0 h-4 ${statusInfo.color}`} data-testid={`badge-status-${parcel.id}`}>
                {statusInfo.label}
              </Badge>
              {parcel.priority !== "STANDARD" && (
                <Badge className="text-[10px] px-1.5 py-0 h-4 bg-orange-100 text-orange-800">
                  {parcel.priority}
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium mt-1" data-testid={`text-recipient-${parcel.id}`}>
              {parcel.recipientName}
            </p>
          </div>
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(v => !v)}
            data-testid={`toggle-expand-${parcel.id}`}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Address */}
          <div className="flex items-start gap-2 text-sm">
            <MapPin size={14} className="shrink-0 mt-0.5 text-muted-foreground" />
            <div>
              <p data-testid={`text-address-${parcel.id}`}>{parcel.recipientAddress}</p>
              <p className="text-muted-foreground">{parcel.recipientCity}, {parcel.recipientState}</p>
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2 text-sm">
            <Phone size={14} className="text-muted-foreground" />
            <a
              href={`tel:${parcel.recipientPhone}`}
              className="text-primary underline"
              data-testid={`link-phone-${parcel.id}`}
            >
              {parcel.recipientPhone}
            </a>
          </div>

          {/* Navigate CTA */}
          {parcel.recipientLat != null && (
            <a
              href={`https://maps.google.com/?q=${parcel.recipientLat},${parcel.recipientLng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
              data-testid={`link-navigate-${parcel.id}`}
            >
              <Navigation size={12} />
              Open in Maps
            </a>
          )}

          {/* Actions */}
          {parcel.status === "IN_TRANSIT" || parcel.status === "PENDING" || parcel.status === "COLLECTED" ? (
            <Button
              size="sm"
              className="w-full"
              disabled={addUpdateMutation.isPending}
              onClick={handleMarkOutForDelivery}
              data-testid={`button-out-for-delivery-${parcel.id}`}
            >
              {addUpdateMutation.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
              Mark Out for Delivery
            </Button>
          ) : parcel.status === "OUT_FOR_DELIVERY" ? (
            <div className="space-y-3">
              <OtpPanel
                parcel={{ ...parcel, otpVerifiedAt: otpVerified ? new Date() : null }}
                tenantId={tenantId}
                onVerified={() => setOtpVerified(true)}
              />
              {otpVerified && !showPODForm && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => setShowPODForm(true)}
                  data-testid={`button-start-pod-${parcel.id}`}
                >
                  <Camera size={13} className="mr-1.5" />
                  Capture Proof of Delivery
                </Button>
              )}
              {otpVerified && showPODForm && (
                <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Received by</Label>
                    <Input
                      value={receivedByName}
                      onChange={e => setReceivedByName(e.target.value)}
                      placeholder="Full name of recipient"
                      className="h-8 text-sm"
                      data-testid={`input-received-by-${parcel.id}`}
                    />
                  </div>
                  <CameraPOD
                    trackingNumber={parcel.trackingNumber}
                    onPhoto={result => setCapturedPhoto(result.dataUrl)}
                    onCancel={() => setShowPODForm(false)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={!receivedByName || submitPODMutation.isPending}
                      onClick={handleSubmitPOD}
                      data-testid={`button-submit-pod-${parcel.id}`}
                    >
                      {submitPODMutation.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
                      Submit Delivery
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowPODForm(false)}
                      data-testid={`button-cancel-pod-${parcel.id}`}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DriverApp() {
  const tenantId = useTenantId();
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const riderCoords = useGeolocation();

  const {
    data,
    isLoading,
    refetch,
  } = trpc.parcels.myDeliveries.useQuery(
    { tenantId },
    { enabled: !!tenantId, refetchInterval: 60_000 },
  );

  const reportLocationMutation = trpc.fleet.reportLocation.useMutation();

  // Report GPS position every 90 seconds while in this page
  useEffect(() => {
    if (!riderCoords || !tenantId || !isOnline) return;
    reportLocationMutation.mutate({
      tenantId,
      lat: riderCoords.lat,
      lng: riderCoords.lng,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderCoords, tenantId]);

  const deliveries = (data?.data ?? []).filter(p => ACTIVE_STATUSES.includes(p.status));
  const completedToday = (data?.data ?? []).filter(p => p.status === "DELIVERED" && p.actualDeliveryAt && new Date(p.actualDeliveryAt).toDateString() === new Date().toDateString()).length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-driver-app">
            My Deliveries
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {user?.name ?? "Rider"} · {deliveries.length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${isOnline ? "text-green-700 border-green-200 bg-green-50" : "text-red-700 border-red-200 bg-red-50"}`}
            data-testid="status-connection"
          >
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isOnline ? "Online" : "Offline"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-deliveries"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* GPS status */}
      {riderCoords ? (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded-md px-3 py-2" data-testid="status-gps">
          <Navigation size={12} />
          GPS active · {riderCoords.lat.toFixed(4)}, {riderCoords.lng.toFixed(4)}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" data-testid="status-gps-unavailable">
          <AlertCircle size={12} />
          GPS unavailable — enable location for geofencing notifications
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="py-3">
          <CardContent className="p-0 text-center">
            <div className="text-2xl font-bold text-primary" data-testid="stat-active">{deliveries.length}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-0 text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="stat-delivered-today">{completedToday}</div>
            <div className="text-xs text-muted-foreground">Delivered Today</div>
          </CardContent>
        </Card>
      </div>

      {/* Delivery list */}
      {isLoading ? (
        <div className="space-y-3" data-testid="deliveries-loading">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground" data-testid="deliveries-empty">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No active deliveries</p>
          <p className="text-xs mt-1">Your assigned parcels will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="deliveries-list">
          {deliveries.map(p => (
            <DeliveryCard
              key={p.id}
              parcel={{
                ...p,
                recipientLat: p.recipientLat ?? null,
                recipientLng: p.recipientLng ?? null,
                otpVerifiedAt: p.otpVerifiedAt ?? null,
              }}
              tenantId={tenantId}
              riderCoords={riderCoords}
              onRefresh={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
