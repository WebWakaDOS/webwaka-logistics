# PHASE 6 PROMPTS — Logistics Domain

This file contains all copy-paste implementation and QA prompts for Phase 6 (Logistics Suite).

**Tasks in this phase:** T-LOG-01, T-LOG-02, T-LOG-03, T-LOG-04, T-LOG-05

**Execution target:** Replit (`webwaka-logistics`)

---


---

## TASK T-LOG-01 — Implement Secure OTP Verification for Proof of Delivery

### PROMPT 1 — IMPLEMENTATION
```markdown
You are a Replit execution agent responsible for implementing a new feature in the `webwaka-logistics` repository.

**Task ID:** T-LOG-01
**Task Title:** Implement Secure OTP Verification for Proof of Delivery

**Context & Objective:**
Trust deficit is the primary barrier in Nigerian e-commerce. Fraudulent delivery marking ("ghost deliveries") is a massive cost center. We must eliminate this by requiring the customer to provide a system-generated OTP to the rider before the parcel state can transition to `DELIVERED`.

**WebWaka Invariants to Honor:**
1. **Build Once Use Infinitely:** You MUST use the existing `@webwaka/core` Termii notification provider to send the SMS. Do not build a custom SMS client.
2. **Mobile/PWA/Offline First:** The rider app must support an offline verification mode (e.g., using a time-based hashed secret pre-synced to Dexie) if the rider loses network at the customer's door.

**Execution Steps:**
1. Read the `webwaka_logistics_research_report.md` (Enhancement L-06) for context.
2. Update the Drizzle schema to add a `delivery_otp` column to the parcels table.
3. Implement backend logic to generate a 4-digit OTP and send it via Termii when the parcel state hits `OUT_FOR_DELIVERY`.
4. Update the Rider App UI to require the OTP input before allowing the `DELIVERED` state transition.
5. Implement the API endpoint to verify the OTP.
6. Implement the offline verification fallback using Dexie.
7. Write tests covering both online and offline OTP verification scenarios.
8. Report completion, summarizing the files changed and confirming adherence to the invariants.
```

### PROMPT 2 — QA / TEST / BUG-FIX
```markdown
You are a Replit QA and Bug-Fix agent responsible for verifying the implementation of Task T-LOG-01 (Implement Secure OTP Verification for Proof of Delivery) in the `webwaka-logistics` repository.

**Verification Steps:**
1. Review the intended scope: Generate OTP on `OUT_FOR_DELIVERY`, send via Core Termii provider, require OTP in Rider UI, and support offline verification via Dexie.
2. Inspect the actual codebase changes.
3. **Audit Core Usage:** Verify that the code strictly uses the `@webwaka/core` Termii provider.
4. **Audit Offline Resilience:** Verify that the rider can still verify the OTP and complete the delivery even if the PWA is offline (using pre-synced hashed secrets).
5. If any omissions, bugs, or invariant violations are found, **FIX THE CODE DIRECTLY**. Do not merely report the issue.
6. Re-test after applying fixes.
7. Provide a final certification report.
```

---

## TASK T-LOG-02 — Implement Tamper-Evident Photo Capture for POD

### PROMPT 1 — IMPLEMENTATION
```markdown
You are a Replit execution agent responsible for implementing a new feature in the `webwaka-logistics` repository.

**Task ID:** T-LOG-02
**Task Title:** Implement Tamper-Evident Photo Capture for POD

**Context & Objective:**
OTPs fail if the customer's phone is dead. A verifiable photo prevents disputes over "where" the package was left. We must provide a secure alternative Proof of Delivery (POD) method requiring the rider to take a geo-tagged, timestamped photo of the delivered item.

**WebWaka Invariants to Honor:**
1. **Mobile/PWA/Offline First:** The photo must be cached locally in Dexie/IndexedDB and synced to Cloudflare R2 only when the network allows.
2. **Thoroughness Over Speed:** You MUST block gallery uploads. The photo must be taken live within the app to prevent fraud.

**Execution Steps:**
1. Read the `webwaka_logistics_research_report.md` (Enhancement L-08) for context.
2. Update the Rider App UI to include a "Photo POD" camera integration (using HTML5 `capture="environment"`).
3. Implement an image watermarking utility that overlays the current timestamp and GPS coordinates onto the image canvas.
4. Implement the logic to save the watermarked image blob to Dexie.
5. Implement the background sync manager to upload the image to Cloudflare R2 and update the Drizzle `pod_image_url` column.
6. Write tests covering the camera capture, watermarking, and background sync logic.
7. Report completion, summarizing the files changed and confirming adherence to the invariants.
```

### PROMPT 2 — QA / TEST / BUG-FIX
```markdown
You are a Replit QA and Bug-Fix agent responsible for verifying the implementation of Task T-LOG-02 (Implement Tamper-Evident Photo Capture for POD) in the `webwaka-logistics` repository.

**Verification Steps:**
1. Review the intended scope: Live camera capture only, GPS/timestamp watermarking, offline Dexie caching, and background R2 upload.
2. Inspect the actual codebase changes.
3. **Audit Fraud Prevention:** Verify that the `<input type="file">` tag strictly enforces `capture="environment"` and does not allow selecting existing photos from the gallery.
4. **Audit Offline Resilience:** Verify that taking a photo while offline successfully caches the image in Dexie for later upload.
5. If any omissions, bugs, or invariant violations are found, **FIX THE CODE DIRECTLY**. Do not merely report the issue.
6. Re-test after applying fixes.
7. Provide a final certification report.
```

---

## TASK T-LOG-03 — Implement Geospatial Order Clustering for Dispatch

### PROMPT 1 — IMPLEMENTATION
```markdown
You are a Replit execution agent responsible for implementing a new feature in the `webwaka-logistics` repository.

**Task ID:** T-LOG-03
**Task Title:** Implement Geospatial Order Clustering for Dispatch

**Context & Objective:**
Manual dispatch does not scale past 50 orders a day. Intelligent clustering maximizes rider density and reduces fuel costs. We must build an algorithm that groups unassigned parcels by geographic proximity and suggests rider assignments.

**WebWaka Invariants to Honor:**
1. **Cloudflare-First Deployment:** D1 (SQLite) does not have native PostGIS. You must implement a lightweight bounding box or geohash (e.g., H3 or basic lat/lon rounding) logic that works within D1 constraints.
2. **Multi-Tenant Tenant-as-Code:** Enforce strict `tenant_id` isolation for all clustering queries.

**Execution Steps:**
1. Read the `webwaka_logistics_research_report.md` (Enhancement D-01) for context.
2. Inspect the current Drizzle schema for delivery coordinates.
3. Implement a lightweight geospatial clustering algorithm suitable for SQLite/D1.
4. Build the Dispatcher UI dashboard to display the generated clusters (e.g., "Cluster A: 12 parcels").
5. Implement the automated assignment suggestion engine based on rider availability and current location.
6. Write tests covering the clustering algorithm with mock coordinate data.
7. Report completion, summarizing the files changed and confirming adherence to the invariants.
```

### PROMPT 2 — QA / TEST / BUG-FIX
```markdown
You are a Replit QA and Bug-Fix agent responsible for verifying the implementation of Task T-LOG-03 (Implement Geospatial Order Clustering for Dispatch) in the `webwaka-logistics` repository.

**Verification Steps:**
1. Review the intended scope: A lightweight D1-compatible clustering algorithm, a Dispatcher UI showing clusters, and an assignment suggestion engine.
2. Inspect the actual codebase changes.
3. **Audit D1 Compatibility:** Verify that the clustering logic does not rely on unsupported database extensions (like PostGIS) and works natively with Cloudflare D1.
4. **Audit Tenancy:** Verify strict `tenant_id` isolation on all clustering queries.
5. If any omissions, bugs, or invariant violations are found, **FIX THE CODE DIRECTLY**. Do not merely report the issue.
6. Re-test after applying fixes.
7. Provide a final certification report.
```

---

## TASK T-LOG-04 — Implement Offline-First Receiving Scanner

### PROMPT 1 — IMPLEMENTATION
```markdown
You are a Replit execution agent responsible for implementing a new feature in the `webwaka-logistics` repository.

**Task ID:** T-LOG-04
**Task Title:** Implement Offline-First Receiving Scanner

**Context & Objective:**
Nigerian warehouse internet is notoriously unstable. Receiving cannot stop when the network drops. We must speed up inbound processing by building a PWA barcode scanner that works completely offline and syncs bulk updates when the network is restored.

**WebWaka Invariants to Honor:**
1. **Mobile/PWA/Offline First:** The scanner must function without any network requests. All scans must be queued in Dexie and flushed in bulk via a background sync manager.
2. **Thoroughness Over Speed:** Ensure the scanner handles rapid, continuous scanning without requiring UI clicks between scans.

**Execution Steps:**
1. Read the `webwaka_logistics_research_report.md` (Enhancement W-01) for context.
2. Implement a React-based PWA camera barcode scanner (using a library like `html5-qrcode` or `quagga2`).
3. Create a Dexie table for `pending_inbound_scans`.
4. Implement the logic to save scanned barcodes to Dexie instantly, providing auditory/visual feedback for each successful scan.
5. Implement the background sync manager to flush the pending scans to the server and update parcel states to `IN_WAREHOUSE`.
6. Write tests covering the offline scanning and bulk sync logic.
7. Report completion, summarizing the files changed and confirming adherence to the invariants.
```

### PROMPT 2 — QA / TEST / BUG-FIX
```markdown
You are a Replit QA and Bug-Fix agent responsible for verifying the implementation of Task T-LOG-04 (Implement Offline-First Receiving Scanner) in the `webwaka-logistics` repository.

**Verification Steps:**
1. Review the intended scope: Continuous PWA barcode scanning, offline Dexie queuing, and bulk background sync to update parcel states.
2. Inspect the actual codebase changes.
3. **Audit Offline Resilience:** Verify that the scanner component does not make any blocking network requests during the scanning process. It must write directly to Dexie.
4. **Audit UX:** Verify that the scanner supports rapid, continuous scanning without requiring the user to click "Next" or "Confirm" between items.
5. If any omissions, bugs, or invariant violations are found, **FIX THE CODE DIRECTLY**. Do not merely report the issue.
6. Re-test after applying fixes.
7. Provide a final certification report.
```

---

## TASK T-LOG-05 — Implement Automated KYC Verification for Gig Riders

### PROMPT 1 — IMPLEMENTATION
```markdown
You are a Replit execution agent responsible for implementing a new feature in the `webwaka-logistics` repository.

**Task ID:** T-LOG-05
**Task Title:** Implement Automated KYC Verification for Gig Riders

**Context & Objective:**
Scaling a gig fleet requires frictionless onboarding. Manual KYC is a massive bottleneck. We must speed up the onboarding of new gig riders by automating the verification of their Driver's License and Guarantor details.

**WebWaka Invariants to Honor:**
1. **Event-Driven Architecture:** Do not build a custom KYC engine. You must emit an event to the Fintech repo (or use a shared Core service if available) to handle the actual identity verification check.
2. **Nigeria-First, Africa-Ready:** Handle PII (Driver's License, BVN) securely according to NDPR guidelines.

**Execution Steps:**
1. Read the `webwaka_logistics_research_report.md` (Enhancement F-01) for context.
2. Build the Rider onboarding UI to collect necessary details and document uploads (saving to R2).
3. Update the Drizzle schema to track rider KYC states (`PENDING`, `VERIFYING`, `ACTIVE`, `REJECTED`).
4. Implement the backend logic to emit a `kyc.verification_requested` event via the `@webwaka/core` publisher.
5. Implement the webhook/event listener to consume the `kyc.verification_completed` event and update the rider's state to `ACTIVE`.
6. Write tests covering the state transitions and event emissions.
7. Report completion, summarizing the files changed and confirming adherence to the invariants.
```

### PROMPT 2 — QA / TEST / BUG-FIX
```markdown
You are a Replit QA and Bug-Fix agent responsible for verifying the implementation of Task T-LOG-05 (Implement Automated KYC Verification for Gig Riders) in the `webwaka-logistics` repository.

**Verification Steps:**
1. Review the intended scope: Rider onboarding UI, R2 document upload, KYC state tracking, and event-driven verification delegation.
2. Inspect the actual codebase changes.
3. **Audit Separation of Concerns:** Verify that the Logistics repo does not attempt to call external identity APIs directly, but correctly delegates this via the Event Bus.
4. **Audit Security:** Verify that uploaded PII documents are stored securely in R2 and not exposed publicly.
5. If any omissions, bugs, or invariant violations are found, **FIX THE CODE DIRECTLY**. Do not merely report the issue.
6. Re-test after applying fixes.
7. Provide a final certification report.
```
