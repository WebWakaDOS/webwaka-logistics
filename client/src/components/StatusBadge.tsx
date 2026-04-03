/**
 * StatusBadge — colour-coded parcel status indicator [Part 10.4]
 * Mobile-first: large touch targets, high-contrast colours for Nigeria's
 * diverse lighting conditions (outdoor use, bright sunlight).
 */

import { PARCEL_STATUS } from "@shared/types";
import { useI18n } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";

export type ParcelStatus = (typeof PARCEL_STATUS)[number];

const STATUS_STYLES: Record<ParcelStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  COLLECTED: "bg-blue-100 text-blue-800 border-blue-200",
  IN_WAREHOUSE: "bg-cyan-100 text-cyan-800 border-cyan-200",
  IN_TRANSIT: "bg-indigo-100 text-indigo-800 border-indigo-200",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-800 border-purple-200",
  DELIVERED: "bg-green-100 text-green-800 border-green-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
  RETURNED: "bg-orange-100 text-orange-800 border-orange-200",
};

const STATUS_DOTS: Record<ParcelStatus, string> = {
  PENDING: "bg-yellow-500",
  COLLECTED: "bg-blue-500",
  IN_WAREHOUSE: "bg-cyan-500",
  IN_TRANSIT: "bg-indigo-500",
  OUT_FOR_DELIVERY: "bg-purple-500",
  DELIVERED: "bg-green-500",
  FAILED: "bg-red-500",
  RETURNED: "bg-orange-500",
};

interface StatusBadgeProps {
  status: ParcelStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useI18n();
  const statusLabels: Record<ParcelStatus, string> = {
    PENDING: t.PENDING,
    COLLECTED: t.COLLECTED,
    IN_WAREHOUSE: "In Warehouse",
    IN_TRANSIT: t.IN_TRANSIT,
    OUT_FOR_DELIVERY: t.OUT_FOR_DELIVERY,
    DELIVERED: t.DELIVERED,
    FAILED: t.FAILED,
    RETURNED: t.RETURNED,
  };
  const label = statusLabels[status] ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
        STATUS_STYLES[status],
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", STATUS_DOTS[status])} />
      {label}
    </span>
  );
}
