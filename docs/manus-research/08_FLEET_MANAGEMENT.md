# Top 20 Carrier, Rider, Driver & Fleet Management Enhancements

The WebWaka Logistics system must manage not only parcels but the people and vehicles moving them. In Nigeria, the logistics workforce is highly fragmented, ranging from full-time employees to gig workers and third-party fleets. Managing this workforce requires robust onboarding, performance tracking, and vehicle maintenance monitoring. Currently, the codebase only has a simple `assignedAgentId` on parcels, lacking a comprehensive fleet management schema.

## 1. Onboarding & Compliance

**Automated KYC Verification (F-01)**
Before a rider can accept deliveries, their identity must be verified. The system should integrate with Nigerian identity APIs (e.g., NIN, BVN) to automatically verify the rider's identity, reducing the manual onboarding burden.
*Implementation*: Build in Logistics repo, potentially using a shared `@webwaka/core/kyc` service if available.
*Priority*: Critical

**Driver's License & Vehicle Registration Tracking (F-02)**
Riders must upload their valid driver's license and vehicle registration (e.g., MOT, Road Worthiness). The system must track expiration dates and automatically suspend riders 7 days before expiry until new documents are uploaded.
*Implementation*: Build in Logistics repo. Requires a new `riders` or `agents` schema.
*Priority*: High

**Guarantor Management (F-03)**
In Nigeria, it's standard practice to require 1-2 guarantors for delivery personnel. The system should digitally capture guarantor details, ID, and a signed undertaking, moving away from paper forms.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Digital Training & Assessment (F-04)**
New riders should complete a short digital training module (e.g., "How to handle fragile items," "Customer service etiquette") and pass a quiz within the app before their account is activated.
*Implementation*: Build in Logistics repo.
*Priority*: Low

**Background Check Integration (F-05)**
Integrate with third-party background check providers to ensure riders have no criminal history, adding a layer of trust for merchants and customers.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

## 2. Vehicle & Fleet Operations

**Vehicle Assignment & Tracking (F-06)**
The system must decouple riders from vehicles. A rider should be able to "check out" a specific vehicle (e.g., Bike #4) at the start of their shift and "check in" at the end, logging the starting and ending odometer readings.
*Implementation*: Build in Logistics repo. Requires `vehicles` and `vehicle_logs` schemas.
*Priority*: High

**Preventative Maintenance Scheduling (F-07)**
Based on the odometer readings or time intervals (e.g., every 3,000 km or 1 month), the system should automatically flag a vehicle for maintenance (oil change, brake pad replacement) and prevent it from being assigned.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Fuel Allowance & Expense Tracking (F-08)**
Riders need a way to log fuel purchases and minor repairs (e.g., a flat tire) within the app, uploading the receipt for reimbursement.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Damage Reporting Workflow (F-09)**
If a vehicle is involved in an accident or damaged, the rider must be able to report it immediately via the app, uploading photos and a description of the incident.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**GPS Tracker Integration (F-10)**
For company-owned fleets, the system should integrate with hardware GPS trackers installed on the vehicles, providing a secondary location data source independent of the rider's phone.
*Implementation*: Build in Logistics repo.
*Priority*: Low

## 3. Performance & Earnings

**Commission & Earnings Dashboard (F-11)**
Gig riders need transparency into their earnings. The app must provide a real-time dashboard showing completed deliveries, calculated commissions, bonuses, and any deductions (e.g., for late deliveries or damaged goods).
*Implementation*: Build in Logistics repo, integrating with Fintech for payouts.
*Priority*: Critical

**Automated Payouts (F-12)**
Instead of manual weekly transfers, the system should automatically calculate earnings and trigger payouts to the rider's bank account or WebWaka Wallet on a set schedule (e.g., every Friday).
*Implementation*: Integrate Logistics repo with Fintech repo.
*Priority*: High

**Performance Tiering (F-13)**
Implement a tiering system (e.g., Bronze, Silver, Gold) based on delivery success rate, customer ratings, and attendance. Higher tiers could unlock higher commission rates or priority access to lucrative routes.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Customer Rating & Feedback Loop (F-14)**
After a delivery, customers should receive an SMS/WhatsApp link to rate the rider (1-5 stars) and leave feedback. This data feeds directly into the rider's performance profile.
*Implementation*: Build in Logistics repo, using `@webwaka/core/notifications`.
*Priority*: High

**Penalty & Deduction Management (F-15)**
If a rider loses a parcel or is found at fault for damage, the system must allow managers to apply a deduction to their earnings, with a clear audit trail and notification to the rider.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

## 4. Shift & Availability Management

**Shift Scheduling & Check-in (F-16)**
For full-time riders, the system must support shift scheduling. Riders must "clock in" via the app (verified by geofence at the hub) to confirm they are ready to receive dispatch assignments.
*Implementation*: Build in Logistics repo.
*Priority*: High

**Gig Worker Availability Toggle (F-17)**
Gig riders should be able to toggle themselves "Online" or "Offline" to indicate their availability for ad-hoc delivery assignments.
*Implementation*: Build in Logistics repo.
*Priority*: Critical

**Zone Preferences (F-18)**
Riders should be able to set their preferred delivery zones (e.g., "I only deliver in Yaba and Surulere"). The dispatch algorithm should respect these preferences when assigning orders.
*Implementation*: Build in Logistics repo.
*Priority*: Medium

**Leave & Absence Requests (F-19)**
Full-time riders need a formalized way to request sick leave or vacation time within the app, allowing dispatchers to plan capacity accordingly.
*Implementation*: Build in Logistics repo.
*Priority*: Low

**Inactive Rider Offboarding (F-20)**
If a gig rider has not completed a delivery in 30 days, the system should automatically deactivate their account and prompt them to re-verify their details before accepting new orders.
*Implementation*: Build in Logistics repo.
*Priority*: Medium
