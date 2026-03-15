/**
 * OfflineBanner — visible indicator when the device is offline [Part 6, CORE-1]
 * Blueprint: "Offline-first — users must always know their connectivity status."
 */

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useI18n } from "@/contexts/I18nContext";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { t } = useI18n();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 bg-orange-600 text-white px-4 py-3 flex items-center gap-3 shadow-lg"
    >
      <WifiOff className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <p className="text-sm font-medium">{t.offline}</p>
    </div>
  );
}
