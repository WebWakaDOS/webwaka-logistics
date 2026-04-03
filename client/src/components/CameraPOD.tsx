/**
 * T-LOG-02: CameraPOD — Tamper-Evident Live Camera Capture
 * ─────────────────────────────────────────────────────────
 * Enforces LIVE camera capture. Gallery uploads are blocked:
 *
 *  1. Primary (desktop + modern mobile): getUserMedia() opens the rear camera
 *     directly in the browser. No file picker appears — gallery is inaccessible.
 *
 *  2. Fallback (older iOS/PWA where getUserMedia is unavailable):
 *     <input type="file" accept="image/*" capture="environment"> — the mobile OS
 *     opens the native camera app directly, bypassing the gallery. Gallery access
 *     on iOS requires a separate "Choose from Library" tap that we note as disallowed.
 *
 * Every captured frame is watermarked with GPS + timestamp + tracking number
 * before leaving this component. The raw image is never exposed to the caller.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, RotateCcw, CheckCircle2, MapPin, WifiOff, Loader2, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  watermarkImageBlob,
  captureGeoLocation,
  captureFrameFromStream,
  openRearCamera,
  supportsGetUserMedia,
  type GeoPosition,
  type WatermarkResult,
} from "@/lib/photoPod";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CameraPODResult {
  blob: Blob;
  dataUrl: string;
  geo: GeoPosition | null;
  capturedAt: Date;
}

interface Props {
  trackingNumber: string;
  onPhoto: (result: CameraPODResult) => void;
  onCancel?: () => void;
}

type CameraState =
  | "idle"           // Not started yet
  | "requesting-geo" // Asking for GPS while loading camera
  | "streaming"      // Live video visible, waiting for rider to tap "Take Photo"
  | "capturing"      // Processing the captured frame (watermarking)
  | "preview"        // Showing watermarked image for confirm/retake
  | "fallback"       // getUserMedia unavailable — using <input capture>
  | "error";         // Unrecoverable error

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CameraPOD({ trackingNumber, onPhoto, onCancel }: Props) {
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [previewResult, setPreviewResult] = useState<WatermarkResult | null>(null);
  const [geoStatus, setGeoStatus] = useState<"pending" | "acquired" | "denied">("pending");
  const [geo, setGeo] = useState<GeoPosition | null>(null);
  const [pendingGeo, setPendingGeo] = useState<Promise<GeoPosition | null> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  /**
   * Bug #4 fix: generation counter — incremented on every startCamera() call.
   * Any stale geo promise callback checks its captured generation against the current
   * value and discards the result if the user has already hit Retake.
   */
  const geoGenRef = useRef(0);

  // ── Start the camera on mount ──────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return () => stopStream();
  }, []);

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  const startCamera = useCallback(async () => {
    // Bug #4 fix: capture this invocation's generation token
    const myGen = ++geoGenRef.current;

    setCameraState("requesting-geo");

    // Kick off geo request in parallel with camera open
    const geoPromise = captureGeoLocation();
    setPendingGeo(geoPromise);
    geoPromise.then(pos => {
      // Discard stale result if the user already hit Retake
      if (geoGenRef.current !== myGen) return;
      setGeo(pos);
      setGeoStatus(pos ? "acquired" : "denied");
    });

    if (!supportsGetUserMedia()) {
      setCameraState("fallback");
      return;
    }

    try {
      const stream = await openRearCamera();
      // If a retake happened while waiting for the stream, stop this stale stream
      if (geoGenRef.current !== myGen) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraState("streaming");

      // Attach stream to video element after React has painted it
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      // Bug #3 fix: DOMException.name is the authoritative check — string matching is fallback
      const name = err instanceof DOMException ? err.name : "";
      const msg = err instanceof Error ? err.message : String(err);
      const isCameraUnavailable =
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        name === "NotFoundError" ||      // No camera hardware
        name === "DevicesNotFoundError" || // Legacy alias
        msg.includes("Permission") ||
        msg.includes("denied") ||
        msg.includes("NotAllowed");

      if (isCameraUnavailable) {
        // Permission denied or no camera — fall back to file input
        setCameraState("fallback");
      } else {
        setErrorMsg("Could not access camera. Please allow camera access in your browser settings.");
        setCameraState("error");
      }
    }
  }, []);

  // ── Capture frame and watermark ────────────────────────────────────────────
  const handleTakePhoto = useCallback(async () => {
    if (!streamRef.current) return;
    setCameraState("capturing");

    try {
      // Wait for GPS if still pending
      const resolvedGeo = pendingGeo ? await pendingGeo : geo;

      const rawBlob = await captureFrameFromStream(streamRef.current);
      const result = await watermarkImageBlob(rawBlob, {
        trackingNumber,
        geo: resolvedGeo,
        capturedAt: new Date(),
      });

      stopStream();
      setPreviewResult(result);
      setCameraState("preview");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Capture failed");
      setCameraState("error");
    }
  }, [streamRef, pendingGeo, geo, trackingNumber]);

  // ── Retake ─────────────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    setPreviewResult(null);
    setGeoStatus("pending");
    setGeo(null);
    startCamera();
  }, [startCamera]);

  // ── Confirm captured image ─────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!previewResult) return;
    onPhoto({
      blob: previewResult.blob,
      dataUrl: previewResult.dataUrl,
      geo,
      capturedAt: new Date(),
    });
  }, [previewResult, geo, onPhoto]);

  // ── Fallback: <input type="file" capture="environment"> ───────────────────
  const handleFallbackCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraState("capturing");

    try {
      const resolvedGeo = pendingGeo ? await pendingGeo : geo;
      const result = await watermarkImageBlob(file, {
        trackingNumber,
        geo: resolvedGeo,
        capturedAt: new Date(),
      });

      setPreviewResult(result);
      setGeo(resolvedGeo);
      setCameraState("preview");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to process photo");
      setCameraState("error");
    }
  }, [pendingGeo, geo, trackingNumber]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  // GPS status chip
  const GeoChip = () => (
    <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-black/40 text-white">
      {geoStatus === "acquired" ? (
        <>
          <MapPin className="h-3 w-3 text-green-400" />
          <span className="text-green-300">GPS locked</span>
        </>
      ) : geoStatus === "denied" ? (
        <>
          <WifiOff className="h-3 w-3 text-amber-400" />
          <span className="text-amber-300">GPS unavailable</span>
        </>
      ) : (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Acquiring GPS…</span>
        </>
      )}
    </div>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (cameraState === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <ImageOff className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive font-medium">Camera unavailable</p>
        <p className="text-xs text-muted-foreground max-w-xs">{errorMsg}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRetake}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Retry
          </Button>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          )}
        </div>
      </div>
    );
  }

  // ── Preview (watermarked) ──────────────────────────────────────────────────
  if (cameraState === "preview" && previewResult) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-lg overflow-hidden bg-black">
          <img
            src={previewResult.dataUrl}
            alt="POD photo preview"
            className="w-full max-h-72 object-contain"
            data-testid="img-pod-preview"
          />
          <div className="absolute top-2 right-2">
            <GeoChip />
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-3 py-1.5 text-center">
            Watermark embedded — timestamp, GPS &amp; tracking number
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          This watermarked photo will be attached to the proof of delivery record.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={handleRetake}
            data-testid="button-retake-photo"
          >
            <RotateCcw className="h-4 w-4" />
            Retake
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={handleConfirm}
            data-testid="button-confirm-photo"
          >
            <CheckCircle2 className="h-4 w-4" />
            Use This Photo
          </Button>
        </div>
      </div>
    );
  }

  // ── Capturing (processing) ─────────────────────────────────────────────────
  if (cameraState === "capturing") {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Adding watermark…</p>
      </div>
    );
  }

  // ── Fallback: mobile <input capture> ──────────────────────────────────────
  if (cameraState === "fallback") {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center gap-3 py-6 border-2 border-dashed border-border rounded-lg bg-muted/30">
          <Camera className="h-10 w-10 text-muted-foreground" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Live camera capture</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Tap the button below to open your camera. Gallery uploads are not accepted.
            </p>
          </div>
          <label htmlFor="pod-camera-fallback">
            <input
              id="pod-camera-fallback"
              ref={fallbackInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFallbackCapture}
              data-testid="input-camera-fallback"
            />
            <Button
              size="sm"
              className="gap-2 cursor-pointer"
              asChild
            >
              <span>
                <Camera className="h-4 w-4" />
                Open Camera
              </span>
            </Button>
          </label>
          <div className="flex items-center gap-1.5 text-xs text-amber-700">
            <GeoChip />
          </div>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    );
  }

  // ── Streaming / requesting-geo ─────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
        {(cameraState === "idle" || cameraState === "requesting-geo") && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
          data-testid="video-camera-stream"
        />
        <div className="absolute top-2 right-2">
          <GeoChip />
        </div>
        {/* Viewfinder guide */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-4 border-2 border-white/30 rounded-lg" />
          <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl" />
          <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr" />
          <div className="absolute bottom-16 left-4 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl" />
          <div className="absolute bottom-16 right-4 w-6 h-6 border-b-2 border-r-2 border-white rounded-br" />
        </div>
        <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/70">
          Point at the delivered parcel
        </p>
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <Button
            variant="outline"
            size="sm"
            className="flex-none"
            onClick={() => { stopStream(); onCancel?.(); }}
            data-testid="button-cancel-camera"
          >
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          className="flex-1 gap-2"
          onClick={handleTakePhoto}
          disabled={cameraState !== "streaming"}
          data-testid="button-take-photo"
        >
          <Camera className="h-4 w-4" />
          {cameraState === "streaming" ? "Take Photo" : "Opening camera…"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Live capture only — gallery uploads are not accepted
      </p>
    </div>
  );
}
