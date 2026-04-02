# Top 20 Delivery Orchestration & Dispatch Enhancements

Delivery orchestration is the brain of the logistics operation. It connects incoming orders from Commerce with the physical execution of the last mile. In Nigeria, traffic, poor addressing, and unpredictable vehicle availability make intelligent dispatch critical. The current codebase supports basic delivery requests and third-party webhook integrations (GIG, Kwik, Sendbox), but lacks sophisticated routing and batching.

## 1. Routing & Batching Intelligence

**Geospatial Order Clustering (D-01)**
Currently, dispatchers assign orders manually. The system must automatically cluster pending `delivery_requests` based on the proximity of their `deliveryAddress`. This requires integrating a geocoding service to convert text addresses into lat/lng coordinates and grouping them into logical delivery zones (e.g., "Lekki Phase 1", "Yaba").
*Implementation*: Build in Logistics repo. Use `@webwaka/core/geolocation` if available, or integrate Google Maps/OpenRouteService.
*Priority*: High

**Automated Route Optimization (D-02)**
Once orders are clustered, the system should generate an optimized route for the rider, minimizing distance and accounting for historical traffic patterns in Nigerian cities.
*Implementation*: Build in Logistics repo using a Traveling Salesperson Problem (TSP) solver or an external routing API.
*Priority*: High

**Multi-Drop Waybill Generation (D-03)**
Riders need a single, consolidated waybill for their entire route, rather than individual printouts for each parcel. The system must generate a digital and printable multi-drop manifest that lists stops in the optimized sequence.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Capacity-Aware Dispatch (D-04)**
The system must prevent assigning 50kg of parcels to a motorcycle rider. Dispatch algorithms must check the aggregated `weightKg` of clustered orders against the assigned vehicle's capacity.
*Implementation*: Build in Logistics repo. Requires a new `vehicles` or `capacity` schema linked to riders.
*Priority*: High

**Dynamic Re-routing on Failure (D-05)**
If a rider marks a delivery as `FAILED` (e.g., customer not reachable), the system should instantly recalculate the remaining route to avoid unnecessary backtracking.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

## 2. Cross-Repo Integration & Orchestration

**Commerce Order Auto-Ingestion (D-06)**
The current `handleOrderReadyForDelivery` event consumer is functional but basic. It must be enhanced to automatically ingest order line items, special handling instructions (e.g., "Fragile"), and preferred delivery windows from the Commerce repository.
*Implementation*: Update `OrderReadyForDeliveryPayload` in `@webwaka/core` and the Logistics consumer.
*Priority*: Critical

**Transport Parcel Handoff (D-07)**
For intercity deliveries, the Logistics repo must seamlessly hand off parcels to the Transport repo. The system already publishes `parcel.seats_required`. It must be enhanced to track the parcel's status based on the Transport trip's state (e.g., when the bus departs, the parcel status updates to `IN_TRANSIT`).
*Implementation*: Logistics must consume `trip.state_changed` events from the platform event bus.
*Priority*: Critical

**Third-Party Carrier Fallback (D-08)**
If no internal riders are available, the system should automatically route the delivery request to the third-party carrier (GIG, Kwik, Sendbox) that provided the best quote in the `DELIVERY_QUOTE` event.
*Implementation*: Build in Logistics repo. Enhance the `assignProvider` mutation to trigger external API calls.
*Priority*: High

**Unified Dispatch Dashboard (D-09)**
Dispatchers need a single pane of glass showing internal riders on a live map alongside the status of third-party carrier shipments.
*Implementation*: Build in Logistics repo.
*Priority*: Critical

**Automated Status Sync to Commerce (D-10)**
When a parcel status changes, the Logistics repo must publish `delivery.status_changed` events. The Commerce repo consumes these to update the customer's order history. This is partially implemented but needs robust retry logic.
*Implementation*: Rely on `@webwaka/core` event bus.
*Priority*: Critical

## 3. Exception Management & Communication

**Proactive Customer ETA Notifications (D-11)**
When a rider starts their route, the system should calculate an ETA for each stop and dispatch an SMS or WhatsApp message to the customer (e.g., "Your order will arrive between 2 PM and 4 PM").
*Implementation*: Use `@webwaka/core/notifications`.
*Priority*: High

**Failed Delivery Quarantine (D-12)**
Orders marked as `FAILED` must not simply disappear. They must enter a "Quarantine" queue on the dispatcher dashboard for manual review, customer contact, and rescheduling.
*Implementation*: Build in Logistics repo.
*Priority*: Critical

**Address Clarification Workflow (D-13)**
Nigerian addresses are notoriously ambiguous. If a rider cannot find an address, they should trigger a "Clarification Request" which sends an automated WhatsApp message to the customer asking them to drop a Google Maps pin.
*Implementation*: Build in Logistics repo, using `@webwaka/core/notifications`.
*Priority*: Medium

**Weather & Traffic Delay Broadcasts (D-14)**
Dispatchers should be able to select a geographic zone and broadcast a delay notification to all affected customers (e.g., "Heavy rain in Lekki is delaying deliveries").
*Implementation*: Build in Logistics repo, using `@webwaka/core/notifications`.
*Priority*: Low

**Return-to-Origin (RTO) Orchestration (D-15)**
If a delivery fails after 3 attempts, the system must automatically generate an RTO waybill to route the item back to the merchant or central warehouse, updating the Commerce repo accordingly.
*Implementation*: Build in Logistics repo, publish event to Commerce.
*Priority*: High

## 4. Analytics & Performance

**Rider Performance Metrics (D-16)**
Dispatchers need data on rider efficiency: average time per drop, success rate, and deviation from the optimized route.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Cost-to-Serve Analysis (D-17)**
Calculate the actual cost of fulfilling an order by combining rider fuel allowances, vehicle depreciation, and time spent, comparing it against the `deliveryFeeKobo` charged.
*Implementation*: Build in Logistics repo, potentially export to Central Analytics.
*Priority*: Low

**Heatmap of Failed Deliveries (D-18)**
Generate a geographic heatmap showing where deliveries fail most frequently. This helps identify problematic neighborhoods or recurring address issues.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Third-Party Carrier SLA Tracking (D-19)**
Monitor the performance of GIG, Kwik, and Sendbox against their quoted ETAs. If a carrier consistently underperforms, the routing engine should deprioritize them.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Predictive Capacity Planning (D-20)**
Use historical data to predict how many riders will be needed in specific zones on specific days (e.g., anticipating a spike during Black Friday).
*Implementation*: Build in Logistics repo, potentially utilizing `@webwaka/core/ai`.
*Priority*: Low
