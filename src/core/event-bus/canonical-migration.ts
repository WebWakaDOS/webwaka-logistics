/**
 * Canonical Event Schema Migration — webwaka-civic
 * Blueprint Reference: WEBWAKA_CROSS_REPO_IMPLEMENTATION_PLAN.md — Phase 3e
 *
 * Task: CIV-4 — Migrate civic event types to canonical @webwaka/core schemas
 *
 * This module re-exports the canonical WebWakaEventType enum from @webwaka/core
 * and provides a mapping from local CivicEventType strings to canonical types
 * where they overlap.
 *
 * MIGRATION STRATEGY:
 * - Civic-specific event types (party.*, election.*, fundraising.*) remain local
 *   as they are domain-specific and not platform-wide
 * - Cross-platform events (auth.*, billing.*, notification.*) MUST use canonical types
 * - New UI Builder and AI Platform events use canonical types exclusively
 *
 * USAGE:
 * Instead of:
 *   import { CivicEventType } from './index'
 *   bus.publish({ event: 'billing.debit.recorded', ... })
 *
 * Use:
 *   import { WebWakaEventType } from './canonical-migration'
 *   bus.publish({ event: WebWakaEventType.BILLING_DEBIT_RECORDED, ... })
 */

// Re-export canonical event types from @webwaka/core
// NOTE: Until @webwaka/core v1.6.0 is published to npm, import directly from the
// local package path or use the string literals as a transitional measure.
// Once published: import { WebWakaEventType } from '@webwaka/core';

/**
 * Canonical event type constants for use in webwaka-civic.
 * These mirror WebWakaEventType from @webwaka/core v1.6.0.
 *
 * Cross-platform events MUST use these constants instead of raw strings.
 */
export const CanonicalEventTypes = {
  // ─── Auth ─────────────────────────────────────────────────────────────────
  USER_REGISTERED: 'auth.user.registered',
  USER_LOGGED_IN: 'auth.user.logged_in',
  USER_LOGGED_OUT: 'auth.user.logged_out',
  TENANT_CREATED: 'auth.tenant.created',

  // ─── Billing ──────────────────────────────────────────────────────────────
  BILLING_DEBIT_RECORDED: 'billing.debit.recorded',
  BILLING_CREDIT_RECORDED: 'billing.credit.recorded',

  // ─── Notification ─────────────────────────────────────────────────────────
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',

  // ─── AI Platform (CORE-9) ─────────────────────────────────────────────────
  AI_CAPABILITY_ENABLED: 'ai.capability.enabled',
  AI_CAPABILITY_DISABLED: 'ai.capability.disabled',
  AI_USAGE_RECORDED: 'ai.usage.recorded',
  AI_BYOK_KEY_ADDED: 'ai.byok.key.added',
  AI_BYOK_KEY_REMOVED: 'ai.byok.key.removed',

  // ─── UI Builder (CORE-9) ──────────────────────────────────────────────────
  UI_TEMPLATE_CREATED: 'ui.template.created',
  UI_TEMPLATE_UPDATED: 'ui.template.updated',
  UI_DEPLOYMENT_REQUESTED: 'ui.deployment.requested',
  UI_DEPLOYMENT_STARTED: 'ui.deployment.started',
  UI_DEPLOYMENT_SUCCESS: 'ui.deployment.success',
  UI_DEPLOYMENT_FAILED: 'ui.deployment.failed',
  UI_BRANDING_UPDATED: 'ui.branding.updated',
} as const;

export type CanonicalEventType = typeof CanonicalEventTypes[keyof typeof CanonicalEventTypes];

/**
 * Type guard: returns true if the given event type is a canonical cross-platform event.
 * Civic-specific events (party.*, election.*, fundraising.*) are NOT canonical.
 */
export function isCanonicalEventType(eventType: string): eventType is CanonicalEventType {
  return Object.values(CanonicalEventTypes).includes(eventType as CanonicalEventType);
}
