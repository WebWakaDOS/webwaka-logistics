/**
 * Parcels List Page [Part 10.4]
 * Mobile-first, offline-aware parcel management dashboard.
 * Shows server-side parcels when online; falls back to local IndexedDB when offline.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, Search, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { useI18n } from "@/contexts/I18nContext";
import { useTenantId } from "@/hooks/useTenantId";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatKobo, formatWAT } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import type { ParcelStatus } from "@/components/StatusBadge";

export default function ParcelsList() {
  const { t, locale } = useI18n();
  const tenantId = useTenantId();
  const isOnline = useOnlineStatus();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: listData, isLoading, refetch } = trpc.parcels.list.useQuery(
    { tenantId, limit: 50, offset: 0 },
    { enabled: isOnline }
  );

  const { data: searchData, isLoading: isSearching } = trpc.parcels.search.useQuery(
    { tenantId, query: searchQuery },
    { enabled: isOnline && searchQuery.length >= 2 }
  );

  const parcels = searchQuery.length >= 2
    ? (searchData?.data ?? [])
    : (listData?.data ?? []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t.parcels}</h1>
          <p className="text-sm text-muted-foreground">
            {parcels.length} {parcels.length === 1 ? "parcel" : "parcels"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={!isOnline}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => setLocation("/parcels/new")}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t.newParcel}</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          className="pl-9"
          placeholder={`${t.search} ${t.trackingNumber.toLowerCase()}...`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label={t.search}
        />
      </div>

      {/* Loading state */}
      {(isLoading || isSearching) && (
        <div className="space-y-3" aria-label={t.loading}>
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isSearching && parcels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
          <p className="text-muted-foreground text-sm">{t.noData}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setLocation("/parcels/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t.newParcel}
          </Button>
        </div>
      )}

      {/* Parcel cards — mobile-first list */}
      {!isLoading && !isSearching && parcels.length > 0 && (
        <div className="space-y-3">
          {parcels.map(parcel => (
            <Card
              key={parcel.id}
              className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
              onClick={() => setLocation(`/parcels/${parcel.trackingNumber}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  setLocation(`/parcels/${parcel.trackingNumber}`);
                }
              }}
              aria-label={`Parcel ${parcel.trackingNumber}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono font-semibold text-primary truncate">
                        {parcel.trackingNumber}
                      </span>
                      <StatusBadge status={parcel.status as ParcelStatus} />
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">
                      {parcel.recipientName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {parcel.recipientCity}, {parcel.recipientState}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatWAT(parcel.createdAt, locale)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-foreground">
                      {formatKobo(parcel.deliveryFeeKobo, parcel.currency, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {t[parcel.priority as "STANDARD" | "EXPRESS" | "SAME_DAY"]}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
