/**
 * Delivery Provider Registry [P04]
 * Manages active providers and computes fee estimates per route.
 */

import type { ProviderQuote, DeliveryAddress } from "@webwaka/core";

export interface DeliveryProvider {
  id: string;
  name: string;
  trackingSupported: boolean;
  isActive: boolean;
  computeQuote(
    pickup: DeliveryAddress,
    delivery: DeliveryAddress,
    weightKg: number
  ): ProviderQuote | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GIG Logistics
// ─────────────────────────────────────────────────────────────────────────────

const gigProvider: DeliveryProvider = {
  id: "gig",
  name: "GIG Logistics",
  trackingSupported: true,
  isActive: true,
  computeQuote(pickup, delivery, weightKg) {
    const isSameCity = pickup.city.toLowerCase() === delivery.city.toLowerCase();
    const baseFeeKobo = isSameCity ? 150000 : 350000;
    const weightSurchargeKobo = Math.round(weightKg * 20000);
    return {
      provider: "gig",
      providerName: "GIG Logistics",
      etaHours: isSameCity ? 4 : 48,
      feeKobo: baseFeeKobo + weightSurchargeKobo,
      trackingSupported: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Kwik Delivery
// ─────────────────────────────────────────────────────────────────────────────

const kwikProvider: DeliveryProvider = {
  id: "kwik",
  name: "Kwik Delivery",
  trackingSupported: true,
  isActive: true,
  computeQuote(pickup, delivery, weightKg) {
    const isSameCity = pickup.city.toLowerCase() === delivery.city.toLowerCase();
    if (!isSameCity) return null;
    return {
      provider: "kwik",
      providerName: "Kwik Delivery",
      etaHours: 2,
      feeKobo: 120000 + Math.round(weightKg * 15000),
      trackingSupported: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sendbox
// ─────────────────────────────────────────────────────────────────────────────

const sendboxProvider: DeliveryProvider = {
  id: "sendbox",
  name: "Sendbox",
  trackingSupported: true,
  isActive: true,
  computeQuote(pickup, delivery, weightKg) {
    const isSameCity = pickup.city.toLowerCase() === delivery.city.toLowerCase();
    return {
      provider: "sendbox",
      providerName: "Sendbox",
      etaHours: isSameCity ? 6 : 72,
      feeKobo: isSameCity ? 130000 : 400000 + Math.round(weightKg * 18000),
      trackingSupported: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Errand Boy (local only)
// ─────────────────────────────────────────────────────────────────────────────

const errandBoyProvider: DeliveryProvider = {
  id: "errand_boy",
  name: "Errand Boy",
  trackingSupported: false,
  isActive: true,
  computeQuote(pickup, delivery, weightKg) {
    const isSameCity = pickup.city.toLowerCase() === delivery.city.toLowerCase();
    if (!isSameCity) return null;
    return {
      provider: "errand_boy",
      providerName: "Errand Boy",
      etaHours: 3,
      feeKobo: 80000 + Math.round(weightKg * 10000),
      trackingSupported: false,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_PROVIDERS: DeliveryProvider[] = [
  gigProvider,
  kwikProvider,
  sendboxProvider,
  errandBoyProvider,
];

/**
 * Get quotes from all active providers for the given route and weight.
 * Respects preferredProviders filter if provided.
 */
export function getProviderQuotes(
  pickup: DeliveryAddress,
  delivery: DeliveryAddress,
  weightKg: number,
  preferredProviders?: string[]
): ProviderQuote[] {
  const providers = ALL_PROVIDERS.filter(
    (p) =>
      p.isActive &&
      (preferredProviders === undefined ||
        preferredProviders.length === 0 ||
        preferredProviders.includes(p.id))
  );

  const quotes: ProviderQuote[] = [];
  for (const provider of providers) {
    const quote = provider.computeQuote(pickup, delivery, weightKg);
    if (quote !== null) {
      quotes.push(quote);
    }
  }

  return quotes.sort((a, b) => a.feeKobo - b.feeKobo);
}
