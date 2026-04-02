# Top 20 Last-Mile Execution & Proof of Delivery Enhancements

The last mile is where digital promises meet physical reality. In Nigeria, riders face bad roads, poor addressing, and unpredictable connectivity. The WebWaka Logistics codebase currently supports basic offline syncing (`syncEngine.ts`) and a simple Proof of Delivery (POD) schema (`proof_of_delivery`), but lacks the robust, fraud-resistant execution workflows needed to ensure trust between merchants, riders, and customers.

## 1. Offline-First Rider App Enhancements

**Background Location Tracking (L-01)**
Riders often lose signal during deliveries. The PWA/App must continuously capture GPS coordinates in the background, storing them locally and syncing them to `parcel_updates` when connectivity returns, ensuring dispatchers always know the rider's true path.
*Implementation*: Build in Logistics repo (Client side).
*Priority*: Critical

**Offline Route Navigation (L-02)**
Since riders may lose data connections, the day's optimized route and essential customer details (name, phone, address, instructions) must be cached locally on the device at the start of the shift.
*Implementation*: Build in Logistics repo. Enhance existing Dexie offline DB.
*Priority*: High

**Battery-Optimized Syncing (L-03)**
Continuous syncing drains phone batteries quickly. The `syncEngine` must be intelligent, pausing non-essential syncs when the battery drops below 20% and prioritizing critical events like `DELIVERED` or `FAILED`.
*Implementation*: Build in Logistics repo (Client side).
*Priority*: Medium

**One-Tap Customer Contact (L-04)**
Riders shouldn't have to copy-paste phone numbers while driving. The app must provide a prominent "Call" or "WhatsApp" button that instantly opens the respective app with a pre-filled message (e.g., "I am 5 mins away with your WebWaka delivery").
*Implementation*: Build in Logistics repo (Client side).
*Priority*: High

**Dynamic Traffic Re-routing Alerts (L-05)**
If a rider is heading toward a known gridlock area (e.g., Third Mainland Bridge during rush hour), the app should push an alert suggesting an alternative route, pulling data from Google Maps or local traffic APIs.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

## 2. Robust Proof of Delivery (POD)

**Secure OTP Verification (L-06)**
A signature or photo is easily faked. The most secure POD in Nigeria is an OTP sent to the customer's phone upon dispatch. The rider must enter this OTP into the app to successfully transition the parcel to `DELIVERED`.
*Implementation*: Build in Logistics repo, using `@webwaka/core/notifications` for SMS/WhatsApp.
*Priority*: Critical

**Geofenced Delivery Confirmation (L-07)**
To prevent "ghost deliveries" (where a rider marks an item delivered without going to the location), the app must verify that the rider's current GPS coordinates match the `deliveryAddress` coordinates within a reasonable radius (e.g., 100 meters) before allowing the `DELIVERED` status.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Tamper-Evident Photo Capture (L-08)**
When capturing a POD photo, the app must use the device camera directly (preventing gallery uploads) and automatically watermark the image with the timestamp, GPS coordinates, and tracking number.
*Implementation*: Build in Logistics repo (Client side).
*Priority*: Critical

**Digital Signature Pad Integration (L-09)**
The current `proof_of_delivery` schema has `signatureUrl`, but the UI lacks a functional signature pad. This must be implemented using a library like `signature_pad` to capture the recipient's signature on the rider's device.
*Implementation*: Build in Logistics repo (Client side).
*Priority*: High

**ID Verification for High-Value Items (L-10)**
For parcels marked with a high `insuranceValueKobo`, the rider must be prompted to scan or photograph the recipient's valid ID (e.g., NIN or Driver's License) to complete the delivery.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

## 3. Exception Handling & Edge Cases

**Standardized Failure Reason Codes (L-11)**
When marking a delivery as `FAILED`, the rider must select from a standardized list of reasons (e.g., "Customer Not Reachable", "Address Not Found", "Customer Rejected Item", "Security Risk") rather than typing free text. This is crucial for analytics and merchant feedback.
*Implementation*: Build in Logistics repo. Update `addUpdate` mutation.
*Priority*: Critical

**Partial Delivery / Rejection Workflow (L-12)**
If a customer orders 3 items but rejects 1 (e.g., wrong size), the rider needs a workflow to mark the parcel as "Partially Delivered," updating the Commerce repo so the merchant knows exactly what was returned.
*Implementation*: Build in Logistics repo, publishing `inventory.updated` to Commerce.
*Priority*: High

**Rescheduling Workflow (L-13)**
If a customer isn't home, they should be able to tell the rider, "Come back tomorrow at 2 PM." The rider logs this, the parcel status changes to `PENDING_RESCHEDULE`, and the routing engine automatically adds it to tomorrow's manifest.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Security Panic Button (L-14)**
If a rider feels threatened or is involved in an accident, they need a discrete "Panic" button in the app that instantly alerts the dispatcher and shares their live location.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Offline Exception Logging (L-15)**
If a delivery fails while offline, the app must enforce the same rigor (reason codes, photos of the location) and queue the failure event for sync, preventing the rider from bypassing the process.
*Implementation*: Build in Logistics repo (Client side).
*Priority*: Critical

## 4. Cash & Payment Handling (Pay on Delivery)

**Cash Collection Enforcement (L-16)**
For Pay on Delivery (PoD) orders, the app must explicitly block the `DELIVERED` transition until the rider confirms they have collected the exact `deliveryFeeKobo` (and item cost, if applicable).
*Implementation*: Build in Logistics repo.
*Priority*: Critical

**Instant Transfer Verification (L-17)**
Many customers prefer bank transfers to cash. The app must integrate with the WebWaka Fintech repo to instantly verify that a transfer to the rider's designated virtual account has been successful, without relying on easily faked SMS receipts.
*Implementation*: Integrate Logistics repo with Fintech repo.
*Priority*: High

**Daily Cash Remittance Workflow (L-18)**
At the end of the shift, the app must generate a "Cash Remittance Summary" detailing exactly how much physical cash the rider must hand over to the hub manager, preventing disputes.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Digital Wallet Settlement (L-19)**
For riders who use their own vehicles (gig economy model), their delivery commission should be instantly credited to their WebWaka Wallet (Fintech repo) upon successful delivery.
*Implementation*: Integrate Logistics repo with Fintech repo.
*Priority*: Medium

**Fraud Risk Scoring (L-20)**
If a customer has a history of rejecting PoD orders or providing fake addresses, the system should flag their future orders, requiring prepayment or warning the rider to verify the address before attempting delivery.
*Implementation*: Build in Logistics repo, potentially using `@webwaka/core/ai`.
*Priority*: Low
