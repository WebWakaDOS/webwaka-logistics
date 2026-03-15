/**
 * Dashboard Home Page [Part 10.4]
 * Summary statistics and quick actions for logistics staff.
 * Mobile-first: card grid, large touch targets.
 */

import { useLocation } from "wouter";
import { Package, Truck, CheckCircle2, Clock, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { useTenantId } from "@/hooks/useTenantId";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

export default function Home() {
  const { t } = useI18n();
  const { user, isAuthenticated, loading } = useAuth();
  const tenantId = useTenantId();
  const [, setLocation] = useLocation();

  const { data: listData } = trpc.parcels.list.useQuery(
    { tenantId, limit: 100, offset: 0 },
    { enabled: isAuthenticated }
  );

  const parcels = listData?.data ?? [];

  // Compute summary stats
  const stats = {
    total: parcels.length,
    pending: parcels.filter(p => p.status === "PENDING").length,
    inTransit: parcels.filter(p => ["IN_TRANSIT", "OUT_FOR_DELIVERY", "COLLECTED"].includes(p.status)).length,
    delivered: parcels.filter(p => p.status === "DELIVERED").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-700 to-blue-900 flex flex-col items-center justify-center px-4 text-center">
        <Package className="h-16 w-16 text-white mb-6" aria-hidden="true" />
        <h1 className="text-3xl font-bold text-white mb-2">WebWaka Logistics</h1>
        <p className="text-blue-200 mb-8 max-w-sm">
          Nigeria &amp; Africa's trusted parcel tracking and delivery management platform.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <Button
            size="lg"
            className="flex-1 bg-white text-blue-700 hover:bg-blue-50 font-semibold"
            onClick={() => window.location.href = getLoginUrl()}
          >
            Sign In
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1 border-white text-white hover:bg-white/10"
            onClick={() => setLocation("/track")}
          >
            <Search className="h-4 w-4 mr-2" />
            Track Parcel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {t.dashboard}
        </h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {user?.name ?? "Agent"}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-700" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">{t.parcels}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-700" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">{t.PENDING}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Truck className="h-5 w-5 text-indigo-700" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.inTransit}</p>
                <p className="text-xs text-muted-foreground">{t.IN_TRANSIT}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-700" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.delivered}</p>
                <p className="text-xs text-muted-foreground">{t.DELIVERED}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          size="lg"
          className="h-14 gap-2 flex-col text-xs"
          onClick={() => setLocation("/parcels/new")}
        >
          <Plus className="h-5 w-5" />
          {t.newParcel}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 gap-2 flex-col text-xs"
          onClick={() => setLocation("/track")}
        >
          <Search className="h-5 w-5" />
          {t.track}
        </Button>
      </div>

      {/* Recent parcels */}
      {parcels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Recent Parcels
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/parcels")}>
              View all
            </Button>
          </div>
          <div className="space-y-2">
            {parcels.slice(0, 5).map(parcel => (
              <button
                key={parcel.id}
                className="w-full text-left"
                onClick={() => setLocation(`/parcels/${parcel.trackingNumber}`)}
              >
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-semibold text-primary truncate">
                          {parcel.trackingNumber}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {parcel.recipientName} — {parcel.recipientCity}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        parcel.status === "DELIVERED" ? "bg-green-100 text-green-800" :
                        parcel.status === "IN_TRANSIT" ? "bg-indigo-100 text-indigo-800" :
                        parcel.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                        "bg-gray-100 text-gray-800"
                      }`}>
                        {t[parcel.status as keyof typeof t] ?? parcel.status}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
