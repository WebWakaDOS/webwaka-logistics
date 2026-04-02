# Top 20 Warehouse & Fulfillment Operations Enhancements

Warehouse operations in Nigeria face significant challenges, including erratic power supply, poor internet connectivity, and manual, paper-based tracking that leads to inventory shrinkage. The current WebWaka Logistics codebase focuses primarily on delivery dispatch and tracking (`parcels`, `delivery_requests`), with no dedicated schema for warehouse receiving, bin locations, or inventory-linked fulfillment status.

To support true e-commerce logistics, the system must bridge the gap between Commerce (which knows what was sold) and Logistics (which knows where it is and how to move it).

## 1. Inbound & Putaway Operations

**Offline-First Receiving Scanner (W-01)**
Warehouse staff often work in areas with poor Wi-Fi. The PWA must support an offline barcode/QR scanner to receive inbound shipments from merchants or suppliers, syncing to the database via the existing `syncEngine` when connectivity is restored.
*Implementation*: Build in Logistics repo. Extend the Dexie offline DB to handle receiving queues.
*Priority*: High

**Dynamic Bin Allocation (W-02)**
Instead of static shelves, the system should dynamically suggest the optimal putaway bin based on the item's velocity (fast-moving items closer to the packing station) and dimensions.
*Implementation*: Build in Logistics repo. Requires a new `warehouse_locations` schema.
*Priority*: Medium

**Supplier ASN (Advance Shipping Notice) Ingestion (W-03)**
When a merchant sends inventory to the WebWaka warehouse, the system must ingest the ASN so staff know what to expect. This reduces receiving time and flags discrepancies immediately.
*Implementation*: Build in Logistics repo, exposing an API for merchants or integrating with the Commerce repo's supplier module.
*Priority*: High

**Cross-Docking Orchestration (W-04)**
For items that don't need to be stored (e.g., pre-packaged merchant orders dropped off for immediate last-mile delivery), the system must bypass putaway and route them directly to the outbound staging area.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Damage & Discrepancy Logging (W-05)**
During receiving, staff must be able to photograph damaged goods and log shortages. This triggers an alert to the merchant and prevents damaged stock from becoming "available" inventory.
*Implementation*: Build in Logistics repo, using S3 image uploads similar to the existing POD flow.
*Priority*: Critical

## 2. Inventory & Order Processing

**Real-Time Inventory Sync to Commerce (W-06)**
The Logistics repo must be the source of truth for physical inventory. When an item is picked, damaged, or lost, the system must publish an `inventory.updated` event to the Commerce repo to prevent overselling.
*Implementation*: Publish via `@webwaka/core` event bus.
*Priority*: Critical

**Wave & Batch Picking (W-07)**
To maximize efficiency, the system should group orders into waves (e.g., "All orders going to Ikeja") or batches (e.g., "Pick 50 units of SKU A for 50 different orders"). The PWA guides the picker through the warehouse using the shortest path.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Pick-to-Light / Voice Picking Integration Readiness (W-08)**
While full automation may be overkill initially, the API should be structured to allow future integration with pick-to-light systems or voice-directed picking headsets.
*Implementation*: Build in Logistics repo (API design only).
*Priority*: Low

**Automated Packing Verification (W-09)**
At the packing station, the staff member scans the picked item and the order barcode. The system verifies a match before generating the final shipping label, drastically reducing mis-ships.
*Implementation*: Build in Logistics repo.
*Priority*: Critical

**Volumetric Weight Calculation (W-10)**
The current `weightGrams` field is insufficient for bulky items. The system must calculate volumetric weight (L x W x H / divisor) to ensure accurate carrier billing and capacity planning.
*Implementation*: Build in Logistics repo. Update `parcels` schema to include dimensions.
*Priority*: High

## 3. Outbound & Dispatch Staging

**Carrier Sorting & Manifest Generation (W-11)**
Once packed, parcels must be sorted by carrier (Internal, GIG, Kwik, Sendbox) or Transport route. The system must generate a consolidated manifest for the carrier driver to sign upon pickup.
*Implementation*: Build in Logistics repo.
*Priority*: Critical

**Transport Hub Integration (W-12)**
For intercity orders, the warehouse must stage parcels for the specific WebWaka Transport bus terminal. The system should group parcels by `tripId` and generate a transfer manifest.
*Implementation*: Build in Logistics repo, consuming `trip.scheduled` events from Transport.
*Priority*: High

**Staging Area Capacity Alerts (W-13)**
If the outbound staging area for a specific carrier or route is full, the system should alert warehouse managers to request an earlier pickup or pause picking for that route.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Late Cut-off Orchestration (W-14)**
The system must prioritize picking and packing for orders approaching their carrier pickup cut-off time, ensuring next-day delivery promises are met.
*Implementation*: Build in Logistics repo.
*Priority*: High

**RTO (Return-to-Origin) Processing (W-15)**
When a failed delivery is returned to the warehouse, the system must guide staff through inspecting the item, determining if it is sellable, and either returning it to stock or flagging it for merchant review.
*Implementation*: Build in Logistics repo, publishing `inventory.updated` to Commerce.
*Priority*: Critical

## 4. Management & Compliance

**Cycle Counting Workflow (W-16)**
Instead of shutting down the warehouse for an annual inventory count, the system should generate daily cycle count tasks for specific bins or fast-moving SKUs, ensuring continuous accuracy.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Staff Productivity Tracking (W-17)**
Track the number of items picked, packed, and received per hour by each warehouse staff member to identify training needs and reward top performers.
*Implementation*: Build in Logistics repo.
*Priority*: Low

**Temperature & Expiry Tracking (W-18)**
For FMCG or pharmaceutical merchants, the system must track batch numbers, expiry dates (FEFO - First Expired, First Out), and temperature requirements (e.g., "Cold Chain").
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Warehouse KPI Dashboard (W-19)**
A real-time dashboard displaying order backlog, average fulfillment time, inventory accuracy, and carrier pickup status.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Audit Logging for Shrinkage (W-20)**
Every inventory adjustment (manual correction, damage, loss) must be logged with the user ID, timestamp, and reason code to deter internal theft and ensure accountability.
*Implementation*: Use `@webwaka/core/audit` if available, or build locally.
*Priority*: Critical
