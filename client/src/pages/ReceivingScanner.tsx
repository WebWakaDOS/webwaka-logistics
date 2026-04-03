/**
 * T-LOG-04: Offline-First Warehouse Receiving Scanner
 * ─────────────────────────────────────────────────────
 * PWA barcode scanner for warehouse inbound receiving.
 * Saves every scan to Dexie instantly — zero network dependency.
 * Background sync flushes pending scans to the server when online.
 *
 * WebWaka Invariants:
 *  - Offline-first: all scans queued in IndexedDB, never blocked by network.
 *  - Rapid scanning: no UI click required between scans; 3-second debounce
 *    prevents double-counting the same package.
 *  - Multi-tenant: scans scoped to the current tenant.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useTenantId } from "@/hooks/useTenantId";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ScanBarcode,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  PackageCheck,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  saveInboundScan,
  getRecentInboundScans,
  countPendingInboundScans,
  type InboundScan,
} from "@/lib/offlineDb";
import { onInboundSyncStatusChange, type InboundSyncStatus } from "@/lib/inboundScanSync";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum milliseconds between scans of the same tracking number. */
const DEBOUNCE_MS = 3000;

/** Formats to scan: QR + common 1D barcode types used on shipping labels. */
const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

const SCANNER_ELEMENT_ID = "receiving-scanner-viewfinder";

// ─────────────────────────────────────────────────────────────────────────────
// Audio feedback — Web Audio API beep (no external assets needed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Play a short beep using Web Audio API.
 * The AudioContext is closed after the sound finishes to prevent
 * resource accumulation over long scanning sessions (BUG-03 fix).
 */
function playBeep(
  type: OscillatorType,
  frequency: number,
  durationSec: number,
  gain: number,
): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = frequency;
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationSec);
    // Close the context a little after the sound ends to free OS audio handles.
    osc.addEventListener("ended", () => {
      ctx.close().catch(() => {});
    });
  } catch {
    // AudioContext may be blocked by browser policy — no beep, scan still saved
  }
}

function playSuccessBeep(): void {
  playBeep("sine", 1046, 0.12, 0.35); // C6 — distinctive, pleasant warehouse beep
}

function playErrorBeep(): void {
  playBeep("square", 220, 0.2, 0.2); // A3 — low error tone
}

// ─────────────────────────────────────────────────────────────────────────────
// Result badge helper
// ─────────────────────────────────────────────────────────────────────────────

function ScanResultBadge({ result }: { result?: InboundScan["result"] }) {
  if (!result) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
        <Clock size={11} />
        Pending sync
      </span>
    );
  }
  if (result === "received") {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 size={11} />
        Received
      </span>
    );
  }
  if (result === "already_received") {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
        <PackageCheck size={11} />
        Already in warehouse
      </span>
    );
  }
  if (result === "not_found") {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
        <XCircle size={11} />
        Not found
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <AlertTriangle size={11} />
      Sync error
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scanner component
// ─────────────────────────────────────────────────────────────────────────────

export default function ReceivingScanner() {
  const tenantId = useTenantId();

  // ── Scanner state ────────────────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flash, setFlash] = useState<"success" | "error" | null>(null);

  // ── Session data ─────────────────────────────────────────────────────────
  const [recentScans, setRecentScans] = useState<InboundScan[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<InboundSyncStatus>("idle");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // ── Refs ─────────────────────────────────────────────────────────────────
  const scannerRef = useRef<Html5Qrcode | null>(null);
  /** Tracks last scan timestamp per tracking number for debouncing. */
  const lastScanAt = useRef<Map<string, number>>(new Map());

  // ─────────────────────────────────────────────────────────────────────────
  // Refresh session data
  // ─────────────────────────────────────────────────────────────────────────
  const refreshData = useCallback(async () => {
    if (!tenantId) return;
    const [scans, count] = await Promise.all([
      getRecentInboundScans(tenantId, 30),
      countPendingInboundScans(),
    ]);
    setRecentScans(scans);
    setPendingCount(count);
  }, [tenantId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Online/offline & sync status listeners
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubSync = onInboundSyncStatusChange(status => {
      setSyncStatus(status);
      if (status === "complete" || status === "error") {
        refreshData();
        // Reset to idle after a short delay
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubSync();
    };
  }, [refreshData]);

  // Load recent scans on mount and when tenantId is ready
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // ─────────────────────────────────────────────────────────────────────────
  // Scan handler — called on every successful barcode decode
  // ─────────────────────────────────────────────────────────────────────────
  const handleScan = useCallback(
    async (rawText: string) => {
      if (!tenantId) return;

      // Normalise the scanned text to a clean tracking number
      const trackingNumber = rawText.trim().toUpperCase();
      if (!trackingNumber) return;

      // Debounce: ignore the same tracking number scanned within DEBOUNCE_MS
      const now = Date.now();
      const lastTime = lastScanAt.current.get(trackingNumber) ?? 0;
      if (now - lastTime < DEBOUNCE_MS) return;
      lastScanAt.current.set(trackingNumber, now);

      // Save to Dexie immediately — zero network dependency
      await saveInboundScan({
        tenantId,
        trackingNumber,
        scannedAt: now,
        synced: false,
      });

      // Visual flash
      setFlash("success");
      setTimeout(() => setFlash(null), 300);

      // Auditory feedback
      playSuccessBeep();

      // Refresh UI counts
      await refreshData();

      toast.success(`Scanned: ${trackingNumber}`, {
        duration: 1500,
        position: "top-center",
      });
    },
    [tenantId, refreshData],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Camera lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  const startScanner = useCallback(async () => {
    setCameraError(null);

    try {
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, {
        formatsToSupport: SCAN_FORMATS,
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 12,
          qrbox: (w: number, h: number) => {
            const side = Math.min(w, h);
            const box = Math.floor(side * 0.72);
            // Rectangular box better suits 1D barcodes on shipping labels
            return { width: Math.floor(box * 1.4), height: box };
          },
          disableFlip: false,
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          handleScan(decodedText).catch(() => {
            playErrorBeep();
          });
        },
        () => {
          // Frame decode failure — normal for frames without a barcode, suppress
        },
      );

      setIsScanning(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
        setCameraError("Camera access denied. Please allow camera permission and try again.");
      } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("no cameras")) {
        setCameraError("No camera found on this device. Use the manual entry field below.");
      } else {
        setCameraError(`Camera error: ${msg}`);
      }
      setIsScanning(false);
    }
  }, [handleScan]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // Ignore stop errors (scanner may already be stopped)
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Auto-start on mount, auto-stop on unmount
  useEffect(() => {
    if (tenantId) {
      startScanner();
    }
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Manual entry fallback
  // ─────────────────────────────────────────────────────────────────────────
  const [manualInput, setManualInput] = useState("");

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    await handleScan(manualInput.trim());
    setManualInput("");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight flex items-center gap-2"
            data-testid="heading-receiving-scanner"
          >
            <ScanBarcode size={24} />
            Receiving Scanner
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scan inbound parcels — works offline
          </p>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {isOnline ? (
            <Badge
              variant="outline"
              className="text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 gap-1"
              data-testid="badge-online-status"
            >
              <Wifi size={12} />
              Online
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700 gap-1"
              data-testid="badge-offline-status"
            >
              <WifiOff size={12} />
              Offline — scans saved locally
            </Badge>
          )}

          {pendingCount > 0 && (
            <Badge
              variant="secondary"
              className="gap-1"
              data-testid="badge-pending-count"
            >
              {syncStatus === "syncing" ? (
                <RefreshCw size={11} className="animate-spin" />
              ) : (
                <Clock size={11} />
              )}
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </div>

      {/* ── Camera viewfinder ───────────────────────────────────────────── */}
      <div className="relative rounded-xl overflow-hidden bg-black border border-border">
        {/* Flash overlay */}
        {flash === "success" && (
          <div
            className="absolute inset-0 bg-green-400/30 z-10 pointer-events-none"
            aria-hidden
          />
        )}

        {/* html5-qrcode mounts into this element */}
        <div
          id={SCANNER_ELEMENT_ID}
          className="w-full"
          style={{ minHeight: 280 }}
          data-testid="scanner-viewfinder"
        />

        {/* Camera error overlay */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white p-6 text-center z-20">
            <AlertTriangle size={32} className="text-amber-400" />
            <p className="text-sm leading-relaxed">{cameraError}</p>
            <Button
              variant="outline"
              size="sm"
              className="text-white border-white/40 hover:bg-white/10"
              onClick={() => {
                setCameraError(null);
                startScanner();
              }}
              data-testid="button-retry-camera"
            >
              <RefreshCw size={14} className="mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {/* Scanning indicator */}
        {isScanning && !cameraError && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
            <span className="text-xs text-white/80 bg-black/50 px-2 py-1 rounded-full">
              Point camera at barcode
            </span>
          </div>
        )}
      </div>

      {/* ── Camera controls ─────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {isScanning ? (
          <Button
            variant="outline"
            size="sm"
            onClick={stopScanner}
            data-testid="button-stop-scanner"
          >
            Stop Camera
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={startScanner}
            disabled={!!cameraError && cameraError.includes("denied")}
            data-testid="button-start-scanner"
          >
            <ScanBarcode size={14} className="mr-1.5" />
            Start Camera
          </Button>
        )}
      </div>

      {/* ── Manual entry fallback ────────────────────────────────────────── */}
      <form
        onSubmit={handleManualSubmit}
        className="flex gap-2"
        data-testid="form-manual-entry"
      >
        <input
          type="text"
          value={manualInput}
          onChange={e => setManualInput(e.target.value)}
          placeholder="Enter tracking number manually…"
          className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="input-manual-tracking"
          autoComplete="off"
          autoCapitalize="characters"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!manualInput.trim()}
          data-testid="button-manual-submit"
        >
          Add
        </Button>
      </form>

      {/* ── Recent scans log ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Session Log
          </h2>
          <span className="text-xs text-muted-foreground" data-testid="text-scan-count">
            {recentScans.length} scan{recentScans.length !== 1 ? "s" : ""}
          </span>
        </div>

        {recentScans.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No scans yet — point camera at a barcode to begin receiving.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {recentScans.map((scan, i) => (
              <div
                key={scan.localId ?? i}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-transparent hover:border-border transition-colors"
                data-testid={`scan-row-${scan.localId}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="font-mono text-sm font-medium truncate"
                    data-testid={`text-tracking-${scan.localId}`}
                  >
                    {scan.trackingNumber}
                  </span>
                  {!scan.synced && (
                    <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {new Date(scan.scannedAt).toLocaleTimeString("en-NG", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <ScanResultBadge result={scan.result} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Loading skeleton while tenant resolves ───────────────────────── */}
      {!tenantId && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      )}
    </div>
  );
}
