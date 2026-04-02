# Top 20 Merchant Logistics Portal Enhancements

Merchants in Nigeria face significant anxiety around fulfillment. They worry about high delivery fees, delayed settlements (especially for Pay on Delivery orders), and the reputational damage of failed deliveries. The WebWaka Logistics system must expose a portal that gives merchants full visibility and control over their shipments, without duplicating the storefront capabilities that belong in the Commerce repository.

## 1. Shipment Creation & Pricing

**Bulk Order Import (M-01)**
Merchants need the ability to upload a CSV or Excel file of daily orders (e.g., from Instagram or WhatsApp sales) to generate multiple delivery requests instantly, bypassing manual data entry.
*Implementation*: Build in Logistics repo. Use `papaparse` or similar library.
*Priority*: High

**Instant Multi-Carrier Quoting (M-02)**
When creating a shipment, merchants should instantly see comparative quotes (Price and ETA) from internal WebWaka riders, GIG, Kwik, and Sendbox. This empowers them to choose the best option for their customer's budget and urgency.
*Implementation*: Build in Logistics repo. Leverage the existing `getProviderQuotes` logic.
*Priority*: Critical

**Dynamic Volumetric Pricing (M-03)**
Merchants must be able to input package dimensions (L x W x H) to receive accurate pricing, preventing unexpected surcharges later when the carrier measures the parcel.
*Implementation*: Build in Logistics repo. Update the `parcels` schema and quoting engine.
*Priority*: High

**Scheduled Pickups (M-04)**
Merchants should be able to schedule a specific time window for a rider to pick up their daily batches, rather than waiting indefinitely for an "ASAP" pickup.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Drop-off Location Finder (M-05)**
For merchants who prefer to drop off parcels to save on pickup fees, the portal should display a map of nearby WebWaka hubs or partner locations (e.g., specific Transport terminals).
*Implementation*: Build in Logistics repo, integrating with Transport hub data.
*Priority*: Medium

## 2. Tracking & Visibility

**Unified Tracking Dashboard (M-06)**
A single view showing the status of all active shipments, regardless of whether they are handled internally or by third-party carriers. Merchants shouldn't have to check three different carrier websites.
*Implementation*: Build in Logistics repo, aggregating data from webhooks.
*Priority*: Critical

**Proactive Exception Alerts (M-07)**
If a delivery is delayed or fails (e.g., customer not reachable), the merchant must receive an immediate notification (in-app or via email) so they can proactively contact the customer and save the sale.
*Implementation*: Build in Logistics repo, using `@webwaka/core/notifications`.
*Priority*: Critical

**Proof of Delivery (POD) Archive (M-08)**
Merchants need access to the digital signature or photo taken at delivery. This is crucial for resolving disputes where a customer claims they never received the item.
*Implementation*: Build in Logistics repo. Expose existing `proof_of_delivery` data.
*Priority*: High

**Customer Tracking Link Generation (M-09)**
Merchants should be able to generate and share a white-labeled tracking link with their customers via WhatsApp or SMS, reducing "Where is my order?" inquiries.
*Implementation*: Build in Logistics repo. Enhance existing `PublicTracking` page.
*Priority*: High

**Historical Performance Analytics (M-10)**
A dashboard showing the merchant their average delivery time, success rate, and most frequent failure reasons over the past 30 days.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

## 3. Financials & Reconciliation

**Pay on Delivery (PoD) Escrow Visibility (M-11)**
For PoD orders, merchants need real-time visibility into whether the cash/transfer has been collected by the rider and when it will be settled to their account.
*Implementation*: Build in Logistics repo, integrating with Fintech/Payments repo.
*Priority*: Critical

**Automated Invoice Generation (M-12)**
At the end of a billing cycle (e.g., weekly), the portal should automatically generate a detailed invoice of all delivery charges incurred, breaking down base fees, weight surcharges, and insurance.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Wallet Top-up & Auto-Deduct (M-13)**
Merchants should be able to pre-fund a logistics wallet. Delivery fees are automatically deducted upon shipment creation, streamlining the process.
*Implementation*: Build in Logistics repo, heavily reliant on Fintech/Payments repo.
*Priority*: High

**Dispute Resolution Workflow (M-14)**
If a parcel is lost or damaged, merchants need a structured workflow to file a claim, upload evidence (e.g., original item photo), and track the resolution status.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Insurance Opt-in (M-15)**
Merchants must be able to declare the value of high-ticket items and opt-in to shipping insurance during parcel creation, adjusting the `insuranceValueKobo` field.
*Implementation*: Build in Logistics repo.
*Priority*: High

## 4. Operational Controls

**Address Book & Customer Directory (M-16)**
Merchants should be able to save frequent customer addresses and contact details to speed up manual shipment creation.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Return Initiation (M-17)**
If a customer wants to return an item, the merchant should be able to initiate a "Reverse Logistics" request from the portal, generating a new waybill for pickup from the customer.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Custom Packaging Requests (M-18)**
Merchants should be able to request WebWaka-branded flyers or boxes to be brought by the pickup rider.
*Implementation*: Build in Logistics repo.
*Priority*: Low

**API Key Management (M-19)**
For larger merchants with their own custom storefronts, the portal must allow them to generate and revoke API keys to integrate directly with WebWaka Logistics.
*Implementation*: Build in Logistics repo, using `@webwaka/core/auth`.
*Priority*: Medium

**Multi-User Access Control (M-20)**
Merchants need to grant access to their staff (e.g., a dedicated fulfillment manager) without sharing their primary login credentials.
*Implementation*: Build in Logistics repo, using `@webwaka/core/auth` RBAC.
*Priority*: Medium
