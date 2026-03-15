/**
 * Public Parcel Tracking Page [Part 10.4]
 * No authentication required — customers can track their parcels.
 * Nigeria First: WAT timezone, NGN currency display.
 * Mobile-first: single-column, optimised for mobile browsers.
 */

import { useState } from "react";
import { Search, Package, MapPin, Clock, CheckCircle2, Truck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/contexts/I18nContext";
import { formatWAT } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import type { ParcelStatus } from "@/components/StatusBadge";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4 text-yellow-600" />,
  COLLECTED: <Package className="h-4 w-4 text-blue-600" />,
  IN_TRANSIT: <Truck className="h-4 w-4 text-indigo-600" />,
  OUT_FOR_DELIVERY: <MapPin className="h-4 w-4 text-purple-600" />,
  DELIVERED: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  FAILED: <AlertCircle className="h-4 w-4 text-red-600" />,
  RETURNED: <AlertCircle className="h-4 w-4 text-orange-600" />,
};

export default function PublicTracking() {
  const { t, locale } = useI18n();
  const [input, setInput] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  const { data, isLoading, error } = trpc.parcels.trackPublic.useQuery(
    { trackingNumber },
    { enabled: trackingNumber.length >= 6 }
  );

  const handleTrack = () => {
    const trimmed = input.trim().toUpperCase();
    if (trimmed.length >= 6) {
      setTrackingNumber(trimmed);
    }
  };

  const parcel = data?.data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-700 to-blue-900">
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-white" aria-hidden="true" />
          <span className="text-white font-bold text-lg">WebWaka Logistics</span>
        </div>
        <LanguageSwitcher />
      </header>

      {/* Hero */}
      <div className="px-4 pt-8 pb-12 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          {t.trackYourParcel}
        </h1>
        <p className="text-blue-200 text-sm mb-8">
          Nigeria &amp; Africa's trusted logistics platform
        </p>

        {/* Search bar */}
        <div className="max-w-md mx-auto flex gap-2">
          <Input
            className="bg-white text-foreground placeholder:text-muted-foreground h-12 text-base"
            placeholder={t.enterTrackingNumber}
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleTrack()}
            aria-label={t.enterTrackingNumber}
            maxLength={32}
          />
          <Button
            size="lg"
            className="h-12 px-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            onClick={handleTrack}
            disabled={input.trim().length < 6}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">{t.track}</span>
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="bg-background min-h-[60vh] rounded-t-3xl px-4 pt-6 pb-20">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-3 max-w-md mx-auto">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {/* Not found */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
            <Package className="h-12 w-12 text-muted-foreground mb-3" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">{t.parcelNotFound}</p>
          </div>
        )}

        {/* Parcel found */}
        {!isLoading && parcel && (
          <div className="max-w-md mx-auto space-y-4">
            {/* Status card */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t.trackingNumber}</p>
                    <p className="font-mono font-bold text-primary">{parcel.trackingNumber}</p>
                  </div>
                  <StatusBadge status={parcel.status as ParcelStatus} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t.city}</p>
                    <p className="font-medium">{parcel.recipientCity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t.state}</p>
                    <p className="font-medium">{parcel.recipientState}</p>
                  </div>
                  {parcel.estimatedDeliveryAt && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">{t.estimatedDelivery}</p>
                      <p className="font-medium">{formatWAT(parcel.estimatedDeliveryAt, locale)}</p>
                    </div>
                  )}
                  {parcel.actualDeliveryAt && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">{t.actualDelivery}</p>
                      <p className="font-medium text-green-700">
                        {formatWAT(parcel.actualDeliveryAt, locale)}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            {parcel.updates.length > 0 && (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Tracking History
                  </h2>
                  <ol className="relative border-l border-border ml-2 space-y-4">
                    {[...parcel.updates].reverse().map((update, idx) => (
                      <li key={idx} className="ml-4">
                        <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border">
                          {STATUS_ICONS[update.status] ?? <Clock className="h-3 w-3" />}
                        </span>
                        <div className="space-y-0.5">
                          <StatusBadge status={update.status as ParcelStatus} />
                          {update.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
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
                </CardContent>
              </Card>
            )}

            {/* NDPR notice */}
            <p className="text-xs text-muted-foreground text-center px-2">{t.ndprNotice}</p>
          </div>
        )}

        {/* Empty state — no search yet */}
        {!isLoading && !error && !parcel && trackingNumber === "" && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-16 w-16 text-muted-foreground/30 mb-4" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">{t.enterTrackingNumber}</p>
          </div>
        )}
      </div>
    </div>
  );
}
