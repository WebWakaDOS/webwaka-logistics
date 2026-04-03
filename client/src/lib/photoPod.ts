/**
 * T-LOG-02: Tamper-Evident Photo Capture Utilities
 * ─────────────────────────────────────────────────
 * All image processing happens client-side using the HTML5 Canvas API.
 * No third-party image libraries — zero extra bundle weight.
 *
 * Invariants:
 *  - Photos MUST be taken live (camera), not uploaded from gallery.
 *  - Every image gets a Canvas-burned watermark: timestamp + GPS + tracking number.
 *  - Geolocation is best-effort; photo is still accepted if GPS is denied.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface WatermarkMeta {
  /** Parcel tracking number — burned into the image */
  trackingNumber: string;
  /** GPS position, or null if denied / unavailable */
  geo: GeoPosition | null;
  /** Capture timestamp — defaults to now if not provided */
  capturedAt?: Date;
}

export interface WatermarkResult {
  blob: Blob;
  dataUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geolocation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request the current GPS position from the browser.
 * Resolves with position or null — never rejects — so callers don't need try/catch.
 * Timeout: 8 seconds (riders are on the move; don't stall the flow).
 */
export function captureGeoLocation(): Promise<GeoPosition | null> {
  return new Promise(resolve => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      },
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp Formatting (WAT — West Africa Time, UTC+1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a Date as a WAT timestamp string for the watermark.
 * e.g. "2026-04-03 14:32:07 WAT"
 */
export function formatWatermarkTimestamp(date: Date): string {
  return date.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + " WAT";
}

/**
 * Format GPS coordinates for the watermark.
 * e.g. "6.4541°N 3.3947°E ±15m"
 */
export function formatGeoWatermark(geo: GeoPosition): string {
  const latDir = geo.lat >= 0 ? "N" : "S";
  const lngDir = geo.lng >= 0 ? "E" : "W";
  const lat = Math.abs(geo.lat).toFixed(4);
  const lng = Math.abs(geo.lng).toFixed(4);
  const acc = Math.round(geo.accuracy);
  return `${lat}°${latDir} ${lng}°${lngDir} ±${acc}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Watermarking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Burn a tamper-evident watermark into an image blob using the HTML5 Canvas API.
 *
 * Watermark layout (bottom bar):
 *   Line 1: "[WebWaka POD] WW-20260403-ABCXYZ"
 *   Line 2: "2026-04-03 14:32:07 WAT"
 *   Line 3: "6.4541°N 3.3947°E ±15m" | "GPS unavailable"
 *
 * The raw image is NEVER stored — only the watermarked version is cached/uploaded.
 */
export function watermarkImageBlob(
  blob: Blob,
  meta: WatermarkMeta,
): Promise<WatermarkResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // ── Watermark bar ────────────────────────────────────────────────────
      const capturedAt = meta.capturedAt ?? new Date();
      const tsLine = formatWatermarkTimestamp(capturedAt);
      const geoLine = meta.geo
        ? formatGeoWatermark(meta.geo)
        : "GPS unavailable";
      const titleLine = `[WebWaka POD] ${meta.trackingNumber}`;

      const lines = [titleLine, tsLine, geoLine];

      // Scale font size proportionally to image height (min 14px, max 36px)
      const fontSize = Math.max(14, Math.min(36, Math.round(canvas.height * 0.028)));
      const lineHeight = fontSize * 1.5;
      const padding = fontSize;
      const barHeight = lineHeight * lines.length + padding * 2;
      const barY = canvas.height - barHeight;

      // Semi-transparent dark bar
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.fillRect(0, barY, canvas.width, barHeight);

      // Text
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textBaseline = "top";

      lines.forEach((line, i) => {
        const y = barY + padding + i * lineHeight;

        // White outline for legibility on any background
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = 3;
        ctx.strokeText(line, padding, y);

        // Main text
        ctx.fillStyle = i === 0 ? "#FFD700" : "#FFFFFF"; // Gold title, white details
        ctx.fillText(line, padding, y);
      });

      // Convert to JPEG blob (quality 0.88 — good balance of size vs quality)
      canvas.toBlob(
        watermarked => {
          if (!watermarked) {
            reject(new Error("Canvas toBlob returned null"));
            return;
          }
          resolve({
            blob: watermarked,
            dataUrl: canvas.toDataURL("image/jpeg", 0.88),
          });
        },
        "image/jpeg",
        0.88,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for watermarking"));
    };

    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Blob to a base64-encoded string (without the data: prefix).
 * Used when submitting POD online via the existing tRPC submitPOD mutation.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the "data:image/jpeg;base64," prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate a deterministic storage key for a POD photo.
 * Format: pod/{tenantId}/{parcelId}/photo-{timestamp}.jpg
 */
export function generatePodImageKey(tenantId: string, parcelId: number): string {
  return `pod/${tenantId}/${parcelId}/photo-${Date.now()}.jpg`;
}

/**
 * Check if the browser supports getUserMedia (live camera access).
 * If false, fall back to <input capture="environment">.
 */
export function supportsGetUserMedia(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * Request access to the rear camera.
 * Throws if permission denied or no camera available.
 */
export async function openRearCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}

/**
 * Capture a still frame from a live MediaStream into a Blob.
 * Uses an offscreen canvas — no video element required.
 */
export function captureFrameFromStream(
  stream: MediaStream,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const track = stream.getVideoTracks()[0];
    if (!track) {
      reject(new Error("No video track in stream"));
      return;
    }

    // Use ImageCapture API if available (cleaner, higher quality)
    if ("ImageCapture" in window) {
      const capture = new (window as any).ImageCapture(track);
      capture
        .takePhoto({ imageHeight: 1280 })
        .then(resolve)
        .catch(() => {
          // ImageCapture failed — fall back to canvas grab
          captureViaCanvas(stream, resolve, reject);
        });
    } else {
      captureViaCanvas(stream, resolve, reject);
    }
  });
}

function captureViaCanvas(
  stream: MediaStream,
  resolve: (b: Blob) => void,
  reject: (e: Error) => void,
): void {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;

  video.onloadedmetadata = () => {
    video.play().then(() => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      video.pause();
      video.srcObject = null;

      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error("Canvas toBlob returned null"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.92,
      );
    });
  };

  video.onerror = () => reject(new Error("Video element error during capture"));
}
