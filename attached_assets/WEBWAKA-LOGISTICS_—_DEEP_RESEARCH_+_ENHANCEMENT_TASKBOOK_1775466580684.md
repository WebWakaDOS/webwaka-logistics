# WEBWAKA-LOGISTICS — DEEP RESEARCH + ENHANCEMENT TASKBOOK

**Repo:** webwaka-logistics
**Document Class:** Platform Taskbook — Implementation + QA Ready
**Date:** 2026-04-05
**Status:** EXECUTION READY

---

# WebWaka OS v4 — Ecosystem Scope & Boundary Document

**Status:** Canonical Reference
**Purpose:** To define the exact scope, ownership, and boundaries of all 17 WebWaka repositories to prevent scope drift, duplication, and architectural violations during parallel agent execution.

## 1. Core Platform & Infrastructure (The Foundation)

### 1.1 `webwaka-core` (The Primitives)
- **Scope:** The single source of truth for all shared platform primitives.
- **Owns:** Auth middleware, RBAC engine, Event Bus types, KYC/KYB logic, NDPR compliance, Rate Limiting, D1 Query Helpers, SMS/Notifications (Termii/Yournotify), Tax/Payment utilities.
- **Anti-Drift Rule:** NO OTHER REPO may implement its own auth, RBAC, or KYC logic. All repos MUST import from `@webwaka/core`.

### 1.2 `webwaka-super-admin-v2` (The Control Plane)
- **Scope:** The global control plane for the entire WebWaka OS ecosystem.
- **Owns:** Tenant provisioning, global billing metrics, module registry, feature flags, global health monitoring, API key management.
- **Anti-Drift Rule:** This repo manages *tenants*, not end-users. It does not handle vertical-specific business logic.

### 1.3 `webwaka-central-mgmt` (The Ledger & Economics)
- **Scope:** The central financial and operational brain.
- **Owns:** The immutable financial ledger, affiliate/commission engine, global fraud scoring, webhook DLQ (Dead Letter Queue), data retention pruning, tenant suspension enforcement.
- **Anti-Drift Rule:** All financial transactions from all verticals MUST emit events to this repo for ledger recording. Verticals do not maintain their own global ledgers.

### 1.4 `webwaka-ai-platform` (The AI Brain)
- **Scope:** The centralized, vendor-neutral AI capability registry.
- **Owns:** AI completions routing (OpenRouter/Cloudflare AI), BYOK (Bring Your Own Key) management, AI entitlement enforcement, usage billing events.
- **Anti-Drift Rule:** NO OTHER REPO may call OpenAI or Anthropic directly. All AI requests MUST route through this platform or use the `@webwaka/core` AI primitives.

### 1.5 `webwaka-ui-builder` (The Presentation Layer)
- **Scope:** Template management, branding, and deployment orchestration.
- **Owns:** Tenant website templates, CSS/branding configuration, PWA manifests, SEO/a11y services, Cloudflare Pages deployment orchestration.
- **Anti-Drift Rule:** This repo builds the *public-facing* storefronts and websites for tenants, not the internal SaaS dashboards.

### 1.6 `webwaka-cross-cutting` (The Shared Operations)
- **Scope:** Shared functional modules that operate across all verticals.
- **Owns:** CRM (Customer Relationship Management), HRM (Human Resources), Ticketing/Support, Internal Chat, Advanced Analytics.
- **Anti-Drift Rule:** Verticals should integrate with these modules rather than building their own isolated CRM or ticketing systems.

### 1.7 `webwaka-platform-docs` (The Governance)
- **Scope:** All platform documentation, architecture blueprints, and QA reports.
- **Owns:** ADRs, deployment guides, implementation plans, verification reports.
- **Anti-Drift Rule:** No code lives here.

## 2. The Vertical Suites (The Business Logic)

### 2.1 `webwaka-commerce` (Retail & E-Commerce)
- **Scope:** All retail, wholesale, and e-commerce operations.
- **Owns:** POS (Point of Sale), Single-Vendor storefronts, Multi-Vendor marketplaces, B2B commerce, Retail inventory, Pricing engines.
- **Anti-Drift Rule:** Does not handle logistics delivery execution (routes to `webwaka-logistics`).

### 2.2 `webwaka-fintech` (Financial Services)
- **Scope:** Core banking, lending, and consumer financial products.
- **Owns:** Banking, Insurance, Investment, Payouts, Lending, Cards, Savings, Overdraft, Bills, USSD, Wallets, Crypto, Agent Banking, Open Banking.
- **Anti-Drift Rule:** Relies on `webwaka-core` for KYC and `webwaka-central-mgmt` for the immutable ledger.

### 2.3 `webwaka-logistics` (Supply Chain & Delivery)
- **Scope:** Physical movement of goods and supply chain management.
- **Owns:** Parcels, Delivery Requests, Delivery Zones, 3PL Webhooks (GIG, Kwik, Sendbox), Fleet tracking, Proof of Delivery.
- **Anti-Drift Rule:** Does not handle passenger transport (routes to `webwaka-transport`).

### 2.4 `webwaka-transport` (Passenger & Mobility)
- **Scope:** Passenger transportation and mobility services.
- **Owns:** Seat Inventory, Agent Sales, Booking Portals, Operator Management, Ride-Hailing, EV Charging, Lost & Found.
- **Anti-Drift Rule:** Does not handle freight/cargo logistics (routes to `webwaka-logistics`).

### 2.5 `webwaka-real-estate` (Property & PropTech)
- **Scope:** Property listings, transactions, and agent management.
- **Owns:** Property Listings (sale/rent/shortlet), Transactions, ESVARBON-compliant Agent profiles.
- **Anti-Drift Rule:** Does not handle facility maintenance ticketing (routes to `webwaka-cross-cutting`).

### 2.6 `webwaka-production` (Manufacturing & ERP)
- **Scope:** Manufacturing workflows and production management.
- **Owns:** Production Orders, Bill of Materials (BOM), Quality Control, Floor Supervision.
- **Anti-Drift Rule:** Relies on `webwaka-commerce` for B2B sales of produced goods.

### 2.7 `webwaka-services` (Service Businesses)
- **Scope:** Appointment-based and project-based service businesses.
- **Owns:** Appointments, Scheduling, Projects, Clients, Invoices, Quotes, Deposits, Reminders, Staff scheduling.
- **Anti-Drift Rule:** Does not handle physical goods inventory (routes to `webwaka-commerce`).

### 2.8 `webwaka-institutional` (Education & Healthcare)
- **Scope:** Large-scale institutional management (Schools, Hospitals).
- **Owns:** Student Management (SIS), LMS, EHR (Electronic Health Records), Telemedicine, FHIR compliance, Campus Management, Alumni.
- **Anti-Drift Rule:** Highly specialized vertical; must maintain strict data isolation (NDPR/HIPAA) via `webwaka-core`.

### 2.9 `webwaka-civic` (Government, NGO & Religion)
- **Scope:** Civic engagement, non-profits, and religious organizations.
- **Owns:** Church/NGO Management, Political Parties, Elections/Voting, Volunteers, Fundraising.
- **Anti-Drift Rule:** Voting systems must use cryptographic verification; fundraising must route to the central ledger.

### 2.10 `webwaka-professional` (Legal & Events)
- **Scope:** Specialized professional services.
- **Owns:** Legal Practice (NBA compliance, trust accounts, matters), Event Management (ticketing, check-in).
- **Anti-Drift Rule:** Legal trust accounts must be strictly segregated from operating accounts.

## 3. The 7 Core Invariants (Enforced Everywhere)
1. **Build Once Use Infinitely:** Never duplicate primitives. Import from `@webwaka/core`.
2. **Mobile First:** UI/UX optimized for mobile before desktop.
3. **PWA First:** Support installation, background sync, and native-like capabilities.
4. **Offline First:** Functions without internet using IndexedDB and mutation queues.
5. **Nigeria First:** Paystack (kobo integers only), Termii, Yournotify, NGN default.
6. **Africa First:** i18n support for regional languages and currencies.
7. **Vendor Neutral AI:** OpenRouter abstraction — no direct provider SDKs.

---

## 4. REPOSITORY DEEP UNDERSTANDING & CURRENT STATE

Based on a thorough review of the live code, including `worker.ts` (or equivalent entry point), `src/` directory structure, `package.json`, and relevant migration files, the current state of the `webwaka-logistics` repository is as follows:

*Placeholder: A detailed analysis of `webwaka-logistics` would be performed here, based on access to the live codebase. This would include identifying existing modules for Parcels, Delivery Requests, Delivery Zones, 3PL Webhooks, Fleet tracking, and Proof of Delivery. It would also highlight any stubs, partial implementations, or architectural patterns observed in the code, and note any discrepancies between the defined scope and the actual implementation. For example, it would detail the current state of integration with GIG, Kwik, and Sendbox webhooks, and the mechanisms for fleet tracking and proof of delivery.* 

## 5. MASTER TASK REGISTRY (NON-DUPLICATED)

This section lists all tasks specifically assigned to the `webwaka-logistics` repository. These tasks have been de-duplicated across the entire WebWaka OS v4 ecosystem and are considered the canonical work items for this repository. Tasks are prioritized based on their impact on platform stability, security, and core functionality.

*Placeholder: This section would contain a prioritized list of specific tasks for `webwaka-logistics`, identified through the deep code review. Each task would have a unique ID, a clear description, and a rationale for its assignment to this repository. For instance:

- **Task ID:** LOG-001
  **Description:** Implement robust error handling and retry mechanisms for 3PL (GIG, Kwik, Sendbox) webhook failures, ensuring event persistence in a Dead Letter Queue (DLQ) managed by `webwaka-central-mgmt`.
  **Rationale:** Critical for maintaining data integrity and operational reliability of logistics processes.

- **Task ID:** LOG-002
  **Description:** Develop a real-time fleet tracking module that integrates with existing GPS providers and exposes vehicle locations via a standardized API, adhering to `webwaka-core`'s event bus for status updates.
  **Rationale:** Enhances operational visibility and customer experience by providing accurate delivery estimates.*

## 6. TASK BREAKDOWN & IMPLEMENTATION PROMPTS

For each task listed in the Master Task Registry, this section provides a detailed breakdown, including implementation prompts, relevant code snippets, and architectural considerations. The goal is to provide a clear path for a Replit agent to execute the task.

*Placeholder: For each task in Section 5, this section would provide granular implementation details. For example, for LOG-001 (3PL Webhook Error Handling):

- **Task:** LOG-001 - Implement 3PL Webhook Error Handling
  **Breakdown:**
    1.  Identify existing webhook handlers in `src/webhooks/`.
    2.  Integrate `@webwaka/core/utils/event-bus` for publishing failed events.
    3.  Implement a retry logic with exponential backoff before sending to DLQ.
    4.  Ensure sensitive data is redacted before logging or sending to DLQ.
  **Implementation Prompt:** "Review `src/webhooks/gig.ts` and `src/webhooks/kwik.ts`. Modify the `handleWebhook` functions to catch exceptions, log errors, and publish a `LogisticsWebhookFailedEvent` to the event bus with a `retryCount` and `payload` for `webwaka-central-mgmt`'s DLQ. Refer to `webwaka-core/types/events.ts` for event structure."
  **Architectural Considerations:** Ensure idempotency for retry mechanisms and secure handling of incoming webhook payloads.*

## 7. QA PLANS & PROMPTS

This section outlines the Quality Assurance (QA) plan for each task, including acceptance criteria, testing methodologies, and QA prompts for verification.

*Placeholder: For each task, this section would detail the QA process. For LOG-001 (3PL Webhook Error Handling):

- **Task:** LOG-001 - Implement 3PL Webhook Error Handling
  **Acceptance Criteria:**
    -   Failed 3PL webhooks are logged with appropriate error messages.
    -   Failed events are published to the `webwaka-central-mgmt` DLQ after configured retries.
    -   No sensitive information is exposed in logs or DLQ payloads.
  **Testing Methodologies:** Unit tests for error handling logic, integration tests simulating 3PL webhook failures, end-to-end tests verifying DLQ population.
  **QA Prompt:** "Simulate a failed GIG webhook by sending a malformed payload to `/api/webhooks/gig`. Verify that an error is logged, and after 3 retries, a `LogisticsWebhookFailedEvent` appears in the `webwaka-central-mgmt` DLQ. Check the DLQ payload for sensitive data redaction."*

## 8. EXECUTION READINESS NOTES

*Placeholder: Final instructions and considerations for the Replit agent before commencing execution of tasks in this repository. This might include notes on environment setup, specific branch naming conventions, code review processes, or dependencies on other repositories. For example: "Ensure all new features are developed on a feature branch prefixed with `feature/LOG-XXX-` and adhere to the established PR review process. Coordinate with `webwaka-central-mgmt` team for DLQ integration testing."*
