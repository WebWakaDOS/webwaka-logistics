# WebWaka Logistics: Comprehensive Deep Research & Enhancement Roadmap

**Date:** April 2026  
**Author:** Manus AI  
**Context:** WebWaka Multi-Repo Platform Ecosystem

This document provides a comprehensive analysis of the `webwaka-logistics` repository, the Nigerian last-mile delivery ecosystem, and a detailed roadmap of 100 enhancements across five core logistics use cases. It strictly adheres to the platform's multi-repo boundaries, ensuring that shared capabilities (Auth, Payments, Notifications, Commerce, Transport) are leveraged rather than duplicated.

---

## Part 1: Codebase Architecture & Integration Analysis

### 1.1 Current Architecture Overview
The `webwaka-logistics` repository is a specialized microservice within the WebWaka ecosystem. It is built on Cloudflare Workers (Node.js compatibility mode), using Drizzle ORM with Cloudflare D1 (SQLite) for the database. The frontend is a React SPA (Vite + Wouter + Tailwind + tRPC) designed as a Progressive Web App (PWA) with offline capabilities powered by Dexie (IndexedDB) and a custom `syncEngine`.

**Core Entities:**
- `parcels`: The central entity representing a physical item to be moved.
- `parcel_updates`: An immutable event log tracking the status and location of a parcel over time.
- `proof_of_delivery`: Records capturing recipient names, signatures (S3 URLs), and photos.
- `delivery_requests`: The contract layer between Commerce and Logistics, representing a merchant's intent to ship.

### 1.2 Cross-Repo Integration Points

The platform relies heavily on an event-driven architecture via the `@webwaka/core` shared package.

**Logistics ↔ Commerce Integration:**
- **Inbound:** Logistics consumes `order.ready_for_delivery` events from Commerce. It validates the payload (pickup/delivery addresses, weight) and creates a `delivery_request`.
- **Outbound (Quoting):** Logistics calculates pricing and ETAs (internal + 3rd party carriers) and publishes a `delivery.quote` event back to Commerce.
- **Outbound (Status):** As the parcel moves through the supply chain, Logistics publishes `delivery.status_changed` events, allowing Commerce to update the merchant and customer without querying the Logistics DB directly.

**Logistics ↔ Transport Integration:**
- **Outbound (Cargo):** For intercity deliveries, Logistics calls the Transport API to publish a `parcel.seats_required` event, effectively booking cargo space on a scheduled bus trip.
- **Inbound (Status):** Logistics tracks the `seatAssignmentStatus` (pending, confirmed, unavailable) based on the Transport module's response.

**External Webhooks:**
- The system currently integrates with GIG Logistics, Kwik Delivery, and Sendbox via dedicated webhook routers (`server/webhooks/providers/*`). These translate proprietary carrier statuses into WebWaka's canonical `DeliveryRequestStatus`.

### 1.3 Reuse Opportunities & Duplication Risks
- **Risk:** Rebuilding user authentication or wallet management. **Mitigation:** Logistics must rely on the platform's central Auth service and the Fintech repo for all wallet/payout logic.
- **Opportunity:** The offline `syncEngine` built for Logistics riders is highly robust. It should be extracted into `@webwaka/core/offline` so the Transport repo (for bus park agents) can reuse it.
- **Risk:** Rebuilding merchant storefronts. **Mitigation:** The Merchant Logistics Portal must focus *only* on fulfillment, waybills, and tracking, linking back to the Commerce repo for order management.

---

## Part 2: Nigeria Logistics Market Research Summary

The Nigerian last-mile delivery sector is characterized by high demand, severe infrastructural deficits, and a profound trust deficit between merchants, riders, and customers.

### 2.1 Operational Realities
- **Addressing Deficits:** A significant portion of delivery failures (up to 25% globally, but much higher in Nigeria) stem from inaccurate or unmapped addresses [1]. Riders waste hours navigating by landmarks ("the green gate after the palm tree") rather than standard street numbers.
- **Infrastructure & Traffic:** Bad roads, seasonal flooding, and chronic traffic congestion (especially in Lagos) make ETA prediction incredibly difficult and drive up the cost-to-serve [2].
- **Offline Constraints:** Riders frequently operate in areas with 2G/EDGE or no connectivity, making offline-first mobile applications a strict requirement for uninterrupted operations [3].

### 2.2 Trust & Proof of Delivery
- **Fraud & Theft:** The ecosystem suffers from high rates of package theft, "ghost deliveries" (riders marking items delivered without visiting the customer), and customer fraud (denying receipt of items) [4].
- **Verification Practices:** Standard signatures are no longer sufficient. Best practices in 2025/2026 mandate Secure OTP (sent to the customer's phone) and tamper-evident photo capture (with embedded GPS and timestamps) to definitively prove delivery [5].

### 2.3 Merchant Pain Points
- **High Costs & Opacity:** Small and Medium Enterprises (SMEs) struggle with the high cost of last-mile delivery, which eats into their margins. They demand transparent, multi-carrier quoting to offer their customers the best rates [6].
- **Pay on Delivery (PoD) Risks:** PoD remains dominant due to low consumer trust in online merchants. However, merchants face severe cash flow issues waiting for logistics partners to remit collected cash [7].
- **Failed Delivery Repercussions:** When a delivery fails, the merchant absorbs the cost of the return trip (RTO) and often loses the customer permanently.

---

## Part 3: Top 100 Logistics Enhancements

The following 100 enhancements are divided across five core use cases. Each enhancement has been evaluated against the multi-repo architecture to ensure it is built in the correct location.

### 3.1 Delivery Orchestration / Dispatch (Top 20)

| ID | Title | Description | Implementation | Priority |
|:---|:---|:---|:---|:---|
| D-01 | Geospatial Order Clustering | Group pending orders by geographic proximity using lat/lng coordinates. | Build in Logistics | High |
| D-02 | Automated Route Optimization | Generate TSP-optimized routes for riders, accounting for historical traffic. | Build in Logistics | High |
| D-03 | Multi-Drop Waybill Generation | Create a single, consolidated digital manifest for a rider's entire route. | Build in Logistics | Medium |
| D-04 | Capacity-Aware Dispatch | Prevent assigning parcels that exceed the specific vehicle's weight/volume limit. | Build in Logistics | High |
| D-05 | Dynamic Re-routing on Failure | Recalculate the remaining route instantly if a delivery fails. | Build in Logistics | Medium |
| D-06 | Commerce Order Auto-Ingestion | Enhance `handleOrderReadyForDelivery` to ingest line items and handling instructions. | Update `@webwaka/core` & Logistics | Critical |
| D-07 | Transport Parcel Handoff | Sync parcel status with Transport `trip.state_changed` events for intercity cargo. | Logistics consumes Transport events | Critical |
| D-08 | Third-Party Carrier Fallback | Auto-route to GIG/Kwik/Sendbox if internal riders are unavailable. | Build in Logistics | High |
| D-09 | Unified Dispatch Dashboard | Live map showing internal riders and 3rd-party carrier statuses in one view. | Build in Logistics | Critical |
| D-10 | Automated Status Sync to Commerce | Robust retry logic for publishing `delivery.status_changed` events. | Rely on `@webwaka/core` | Critical |
| D-11 | Proactive Customer ETA Notifications | SMS/WhatsApp alerts with calculated ETAs when the rider starts the route. | Use `@webwaka/core/notifications` | High |
| D-12 | Failed Delivery Quarantine | Route `FAILED` orders to a dedicated dispatcher queue for manual review/rescheduling. | Build in Logistics | Critical |
| D-13 | Address Clarification Workflow | Automated WhatsApp request for customers to drop a Google Maps pin if address is unfound. | Use `@webwaka/core/notifications` | Medium |
| D-14 | Weather & Traffic Delay Broadcasts | Dispatcher tool to send bulk delay alerts to customers in affected geographic zones. | Use `@webwaka/core/notifications` | Low |
| D-15 | Return-to-Origin (RTO) Orchestration | Auto-generate return waybills after 3 failed attempts and notify Commerce. | Build in Logistics | High |
| D-16 | Rider Performance Metrics | Analytics on average drop time, success rate, and route deviation. | Build in Logistics | Medium |
| D-17 | Cost-to-Serve Analysis | Calculate actual fulfillment cost (fuel, time, depreciation) vs. delivery fee charged. | Build in Logistics | Low |
| D-18 | Heatmap of Failed Deliveries | Geographic visualization of frequent failure zones to identify addressing blackspots. | Build in Logistics | Medium |
| D-19 | Third-Party Carrier SLA Tracking | Monitor GIG/Kwik/Sendbox ETA compliance to inform future routing decisions. | Build in Logistics | Medium |
| D-20 | Predictive Capacity Planning | Forecast rider requirements based on historical volume spikes (e.g., Black Friday). | Build in Logistics (Use Platform AI) | Low |

### 3.2 Warehouse / Fulfillment Operations (Top 20)

| ID | Title | Description | Implementation | Priority |
|:---|:---|:---|:---|:---|
| W-01 | Offline-First Receiving Scanner | PWA barcode scanner for inbound shipments that syncs via Dexie when online. | Build in Logistics | High |
| W-02 | Dynamic Bin Allocation | Suggest putaway locations based on SKU velocity and parcel dimensions. | Build in Logistics | Medium |
| W-03 | Supplier ASN Ingestion | Pre-load expected inbound inventory data from merchants to speed up receiving. | Logistics API / Commerce Integration | High |
| W-04 | Cross-Docking Orchestration | Bypass putaway for pre-packaged items, routing them directly to outbound staging. | Build in Logistics | High |
| W-05 | Damage & Discrepancy Logging | S3 image upload workflow during receiving to document damaged merchant stock. | Build in Logistics | Critical |
| W-06 | Real-Time Inventory Sync to Commerce | Publish `inventory.updated` events to Commerce to prevent overselling. | Publish via `@webwaka/core` | Critical |
| W-07 | Wave & Batch Picking | Group orders by zone or SKU to optimize picker routing through the warehouse. | Build in Logistics | High |
| W-08 | Pick-to-Light Integration Readiness | API structure designed to support future hardware picking integrations. | Build in Logistics | Low |
| W-09 | Automated Packing Verification | Scan picked item + order barcode to verify match before printing shipping label. | Build in Logistics | Critical |
| W-10 | Volumetric Weight Calculation | Calculate L x W x H / divisor to ensure accurate carrier billing and capacity planning. | Build in Logistics | High |
| W-11 | Carrier Sorting & Manifest Generation | Generate consolidated handover manifests for GIG/Kwik/Sendbox drivers. | Build in Logistics | Critical |
| W-12 | Transport Hub Integration | Stage intercity parcels by `tripId` and generate transfer manifests for the bus terminal. | Consume Transport `trip.scheduled` | High |
| W-13 | Staging Area Capacity Alerts | Alert managers when a specific carrier's outbound staging zone is full. | Build in Logistics | Medium |
| W-14 | Late Cut-off Orchestration | Prioritize picking for orders approaching their specific carrier pickup deadline. | Build in Logistics | High |
| W-15 | RTO (Return-to-Origin) Processing | Workflow for inspecting returned items and deciding to restock or return to merchant. | Build in Logistics | Critical |
| W-16 | Cycle Counting Workflow | Generate daily partial inventory count tasks to maintain accuracy without shutting down. | Build in Logistics | Medium |
| W-17 | Staff Productivity Tracking | KPIs on items received/picked/packed per hour by individual warehouse staff. | Build in Logistics | Low |
| W-18 | Temperature & Expiry Tracking | Track FEFO (First Expired, First Out) and cold chain requirements for specific SKUs. | Build in Logistics | Medium |
| W-19 | Warehouse KPI Dashboard | Real-time view of order backlog, fulfillment time, and inventory accuracy. | Build in Logistics | High |
| W-20 | Audit Logging for Shrinkage | Immutable log of all manual inventory adjustments to deter internal theft. | Use `@webwaka/core/audit` | Critical |

### 3.3 Merchant Logistics Portal (Top 20)

| ID | Title | Description | Implementation | Priority |
|:---|:---|:---|:---|:---|
| M-01 | Bulk Order Import | CSV/Excel upload for merchants to generate hundreds of delivery requests instantly. | Build in Logistics | High |
| M-02 | Instant Multi-Carrier Quoting | Display comparative prices and ETAs from internal riders, GIG, Kwik, and Sendbox. | Build in Logistics | Critical |
| M-03 | Dynamic Volumetric Pricing | Accurate upfront pricing based on merchant-provided L x W x H dimensions. | Build in Logistics | High |
| M-04 | Scheduled Pickups | Allow merchants to select specific time windows for WebWaka riders to collect batches. | Build in Logistics | Medium |
| M-05 | Drop-off Location Finder | Map of nearby WebWaka hubs or Transport terminals for merchants avoiding pickup fees. | Integrate with Transport Hubs | Medium |
| M-06 | Unified Tracking Dashboard | Single pane of glass for all shipments, regardless of the assigned third-party carrier. | Build in Logistics | Critical |
| M-07 | Proactive Exception Alerts | Instant notifications to merchants if a delivery fails, allowing them to save the sale. | Use `@webwaka/core/notifications` | Critical |
| M-08 | Proof of Delivery (POD) Archive | Merchant access to recipient signatures and photos to resolve customer disputes. | Build in Logistics | High |
| M-09 | Customer Tracking Link Generation | White-labeled tracking URLs merchants can share via WhatsApp/SMS. | Enhance existing PublicTracking | High |
| M-10 | Historical Performance Analytics | Merchant dashboard showing average delivery times and success rates over 30 days. | Build in Logistics | Medium |
| M-11 | Pay on Delivery (PoD) Escrow Visibility | Real-time tracking of collected cash and expected settlement dates for PoD orders. | Integrate with Fintech repo | Critical |
| M-12 | Automated Invoice Generation | Weekly/Monthly detailed breakdown of all delivery fees, surcharges, and insurance costs. | Build in Logistics | High |
| M-13 | Wallet Top-up & Auto-Deduct | Pre-funded logistics wallet for seamless deduction of delivery fees upon creation. | Integrate with Fintech repo | High |
| M-14 | Dispute Resolution Workflow | Structured process for merchants to file claims for lost or damaged parcels. | Build in Logistics | Medium |
| M-15 | Insurance Opt-in | Allow merchants to declare value and purchase shipping insurance during parcel creation. | Build in Logistics | High |
| M-16 | Address Book & Customer Directory | Save frequent customer details to accelerate manual shipment creation. | Build in Logistics | Medium |
| M-17 | Return Initiation | Allow merchants to trigger "Reverse Logistics" waybills for customer returns. | Build in Logistics | High |
| M-18 | Custom Packaging Requests | Merchants can request WebWaka-branded flyers/boxes to be brought by the pickup rider. | Build in Logistics | Low |
| M-19 | API Key Management | Allow large merchants to generate keys for direct integration with WebWaka Logistics. | Use `@webwaka/core/auth` | Medium |
| M-20 | Multi-User Access Control | RBAC allowing merchants to grant portal access to their fulfillment staff. | Use `@webwaka/core/auth` | Medium |

### 3.4 Last-Mile Execution / Proof of Delivery (Top 20)

| ID | Title | Description | Implementation | Priority |
|:---|:---|:---|:---|:---|
| L-01 | Background Location Tracking | Continuous GPS caching synced via Dexie when online to track rider paths. | Build in Logistics (Client) | Critical |
| L-02 | Offline Route Navigation | Cache the day's optimized route and customer details locally on the rider's device. | Enhance Dexie offline DB | High |
| L-03 | Battery-Optimized Syncing | `syncEngine` pauses non-essential syncs when device battery drops below 20%. | Build in Logistics (Client) | Medium |
| L-04 | One-Tap Customer Contact | In-app buttons to instantly call or WhatsApp the customer with a pre-filled ETA message. | Build in Logistics (Client) | High |
| L-05 | Dynamic Traffic Re-routing Alerts | Push notifications suggesting alternative routes based on live traffic data. | Build in Logistics | Medium |
| L-06 | Secure OTP Verification | Require the rider to input an OTP sent to the customer's phone to mark as `DELIVERED`. | Use `@webwaka/core/notifications` | Critical |
| L-07 | Geofenced Delivery Confirmation | Block `DELIVERED` status if rider's GPS is not within 100m of the `deliveryAddress`. | Build in Logistics | High |
| L-08 | Tamper-Evident Photo Capture | Force in-app camera use (no gallery uploads) and watermark with timestamp/GPS. | Build in Logistics (Client) | Critical |
| L-09 | Digital Signature Pad Integration | Implement `signature_pad` library to capture recipient signatures on the rider's screen. | Build in Logistics (Client) | High |
| L-10 | ID Verification for High-Value Items | Prompt rider to photograph recipient's NIN/Driver's License for insured parcels. | Build in Logistics | Medium |
| L-11 | Standardized Failure Reason Codes | Force selection from a predefined list (e.g., "Customer Not Reachable") instead of free text. | Build in Logistics | Critical |
| L-12 | Partial Delivery / Rejection Workflow | Allow riders to mark specific items within a parcel as rejected, updating Commerce inventory. | Publish `inventory.updated` | High |
| L-13 | Rescheduling Workflow | Allow riders to log customer requests to "Come back tomorrow," updating the dispatch queue. | Build in Logistics | High |
| L-14 | Security Panic Button | Discrete in-app button to alert dispatchers and share live location in emergencies. | Build in Logistics | Medium |
| L-15 | Offline Exception Logging | Enforce failure reason codes and photo capture even when the app is entirely offline. | Build in Logistics (Client) | Critical |
| L-16 | Cash Collection Enforcement | Block `DELIVERED` transition for PoD orders until rider confirms exact cash collected. | Build in Logistics | Critical |
| L-17 | Instant Transfer Verification | Verify customer bank transfers to rider virtual accounts instantly via the Fintech repo. | Integrate with Fintech repo | High |
| L-18 | Daily Cash Remittance Workflow | Generate a shift-end summary detailing physical cash the rider must hand over to the hub. | Build in Logistics | High |
| L-19 | Digital Wallet Settlement | Instantly credit gig rider delivery commissions to their WebWaka Wallet upon delivery. | Integrate with Fintech repo | Medium |
| L-20 | Fraud Risk Scoring | Flag customers with a history of rejecting PoD orders, requiring prepayment for future orders. | Build in Logistics (Platform AI) | Low |

### 3.5 Carrier / Rider / Driver / Fleet Management (Top 20)

| ID | Title | Description | Implementation | Priority |
|:---|:---|:---|:---|:---|
| F-01 | Automated KYC Verification | Integrate with NIN/BVN APIs to automatically verify rider identities during onboarding. | Use `@webwaka/core/kyc` | Critical |
| F-02 | Document Expiry Tracking | Track Driver's License/MOT expiry and auto-suspend riders until new documents are uploaded. | Build in Logistics | High |
| F-03 | Guarantor Management | Digitally capture guarantor details, ID, and signed undertakings to replace paper forms. | Build in Logistics | Medium |
| F-04 | Digital Training & Assessment | Require new riders to pass an in-app quiz on handling and etiquette before activation. | Build in Logistics | Low |
| F-05 | Background Check Integration | Third-party API integration to verify riders have no criminal history. | Build in Logistics | Medium |
| F-06 | Vehicle Assignment & Tracking | Allow riders to "check out/in" specific vehicles, logging starting/ending odometers. | Build in Logistics | High |
| F-07 | Preventative Maintenance Scheduling | Flag vehicles for maintenance based on odometer readings (e.g., every 3,000 km). | Build in Logistics | High |
| F-08 | Fuel Allowance & Expense Tracking | In-app workflow for riders to log fuel purchases and upload receipts for reimbursement. | Build in Logistics | Medium |
| F-09 | Damage Reporting Workflow | Allow riders to immediately report accidents/damage with photos and descriptions. | Build in Logistics | Medium |
| F-10 | GPS Tracker Integration | Integrate with hardware GPS devices on company vehicles as a secondary location source. | Build in Logistics | Low |
| F-11 | Commission & Earnings Dashboard | Real-time transparency for gig riders showing completed deliveries and calculated payouts. | Integrate with Fintech repo | Critical |
| F-12 | Automated Payouts | Trigger scheduled payouts (e.g., every Friday) to the rider's WebWaka Wallet or bank account. | Integrate with Fintech repo | High |
| F-13 | Performance Tiering | Bronze/Silver/Gold tiers based on success rates, unlocking higher commissions or better routes. | Build in Logistics | Medium |
| F-14 | Customer Rating & Feedback Loop | Post-delivery SMS asking customers to rate the rider, feeding into their performance profile. | Use `@webwaka/core/notifications` | High |
| F-15 | Penalty & Deduction Management | Manager workflow to apply deductions to rider earnings for lost or damaged parcels. | Build in Logistics | Medium |
| F-16 | Shift Scheduling & Check-in | Full-time riders must "clock in" via the app (geofenced to the hub) to receive assignments. | Build in Logistics | High |
| F-17 | Gig Worker Availability Toggle | Allow gig riders to toggle "Online/Offline" to indicate readiness for ad-hoc orders. | Build in Logistics | Critical |
| F-18 | Zone Preferences | Riders can set preferred delivery zones, which the dispatch algorithm respects. | Build in Logistics | Medium |
| F-19 | Leave & Absence Requests | In-app workflow for full-time riders to request sick leave or vacation time. | Build in Logistics | Low |
| F-20 | Inactive Rider Offboarding | Auto-deactivate gig riders who haven't completed a delivery in 30 days, requiring re-verification. | Build in Logistics | Medium |

---

## Part 4: Cross-Repo Integration Map

To adhere to the "Build Once, Use Everywhere" platform principle, the WebWaka ecosystem must maintain strict repository boundaries.

### What belongs in `webwaka-logistics`
- **Parcel State Machine:** The core lifecycle of a physical item (`PENDING` to `DELIVERED`).
- **Routing & Dispatch Logic:** Algorithms that group addresses and assign riders.
- **Warehouse Bin Management:** Tracking exactly where an item sits on a shelf.
- **Rider/Fleet Management:** Tracking vehicles, odometers, and rider shifts.
- **Offline Sync Engine (Client):** The Dexie-based PWA logic for field operations.

### What belongs in `webwaka-commerce` (and is consumed by Logistics)
- **Storefront & Checkout:** Logistics never handles the shopping cart.
- **Order Origination:** Commerce creates the order and publishes `order.ready_for_delivery`.
- **Merchant Inventory Logic:** Commerce owns the "Available for Sale" number; Logistics owns the physical "In Bin" number.

### What belongs in `webwaka-transport` (and is consumed by Logistics)
- **Intercity Bus Routes:** Logistics does not define routes between Lagos and Abuja.
- **Trip Schedules & States:** Logistics listens for `trip.departed` to update intercity parcel statuses.
- **Seat/Cargo Inventory:** Logistics requests space (`parcel.seats_required`) from Transport's Durable Objects.

### What belongs in `@webwaka/core` (Shared Platform Services)
- **Authentication & RBAC:** User login and permissions.
- **Notifications:** SMS, WhatsApp, and Email dispatching.
- **Audit Logging:** Immutable records of critical actions (e.g., inventory adjustments).
- **Event Bus:** The central nervous system passing payloads between repos.

### What belongs in `webwaka-fintech`
- **Payment Processing:** Paystack/Flutterwave integrations.
- **Wallets & Escrow:** Holding Pay on Delivery funds and managing rider commission wallets.

---

## Part 5: Recommended Execution Order

This 12-week roadmap sequences the enhancements based on technical dependencies and immediate business value in the Nigerian market.

### Phase 1: Foundation & Trust (Weeks 1-3)
*Focus: Stop the bleeding on failed deliveries and secure the Last Mile.*
1. **(L-06) Secure OTP Verification:** Stop "ghost deliveries" immediately.
2. **(L-08) Tamper-Evident Photo Capture:** Secure the alternative POD method.
3. **(L-11) Standardized Failure Reason Codes:** Gain accurate data on why deliveries fail.
4. **(D-06) Commerce Order Auto-Ingestion:** Solidify the event contract with the Commerce repo.
5. **(M-06) Unified Tracking Dashboard:** Give merchants visibility into the new, secure process.

### Phase 2: Routing & Third-Party Scale (Weeks 4-6)
*Focus: Optimize internal dispatch and leverage external carriers.*
1. **(D-01) Geospatial Order Clustering:** Stop manual dispatcher assignment.
2. **(D-08) Third-Party Carrier Fallback:** Ensure 100% fulfillment even if internal riders are busy.
3. **(M-02) Instant Multi-Carrier Quoting:** Expose the 3rd-party pricing to merchants.
4. **(D-09) Unified Dispatch Dashboard:** Manage internal and external shipments in one view.
5. **(F-01) Automated KYC Verification:** Speed up onboarding of new internal/gig riders.

### Phase 3: Warehouse & Fulfillment Control (Weeks 7-9)
*Focus: Bridge the gap between Commerce inventory and physical logistics.*
1. **(W-01) Offline-First Receiving Scanner:** Speed up inbound processing.
2. **(W-06) Real-Time Inventory Sync to Commerce:** Stop overselling.
3. **(W-09) Automated Packing Verification:** Eliminate mis-ships.
4. **(W-11) Carrier Sorting & Manifest Generation:** Streamline the handoff to riders/carriers.
5. **(W-15) RTO (Return-to-Origin) Processing:** Close the loop on the failed deliveries captured in Phase 1.

### Phase 4: Financials & Advanced Fleet (Weeks 10-12)
*Focus: Manage the money and maintain the vehicles.*
1. **(L-16) Cash Collection Enforcement (PoD):** Secure physical cash collection.
2. **(M-11) Pay on Delivery Escrow Visibility:** Rebuild merchant trust by showing their money.
3. **(F-11) Commission & Earnings Dashboard:** Keep gig riders motivated and transparently paid.
4. **(F-06) Vehicle Assignment & Tracking:** Take control of the physical fleet assets.
5. **(D-07) Transport Parcel Handoff:** Fully integrate intercity logistics with the Transport repo.

---

## References
[1] iDrive Logistics. (2025). Last-Mile Delivery Challenges and Innovations.
[2] Tradift. (n.d.). How to Navigate Last-Mile Delivery Challenges in Nigeria.
[3] Samuel Agbo Eneojo. (2026). Nigeria's Last-Mile Delivery Challenges.
[4] IDFC FIRST Bank. (2025). Fraud Awareness: Delivery Scams.
[5] WebWaka Platform Docs. (2026). FACTORY-STANDARD-01: Offline-First Architecture.
[6] Mordor Intelligence. (2026). Nigeria Freight and Logistics Market Size & Growth.
[7] Gift Olomi. (n.d.). Nigerian E-commerce Logistics Issues: A Systemic Problem.
