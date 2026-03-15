/**
 * useTenantId — derives the tenantId from the authenticated user [Part 9.2]
 * Blueprint: "tenantId on all models" — the tenantId is the user's openId
 * (or a dedicated tenant identifier if the platform adds multi-tenancy later).
 * For now, each user's openId acts as their tenant scope.
 */

import { useAuth } from "@/_core/hooks/useAuth";

export function useTenantId(): string {
  const { user } = useAuth();
  // Use openId as tenantId — platform convention for single-user tenants.
  // When CORE-3 (Tenant Management) is implemented, this will be replaced
  // with the user's assigned tenantId from the tenant registry.
  return user?.openId ?? "default";
}
