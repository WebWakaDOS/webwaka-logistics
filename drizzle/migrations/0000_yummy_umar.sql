CREATE TABLE `delivery_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderId` text NOT NULL,
	`tenantId` text NOT NULL,
	`sourceModule` text NOT NULL,
	`vendorId` text,
	`pickupAddress` text NOT NULL,
	`deliveryAddress` text NOT NULL,
	`itemsSummary` text NOT NULL,
	`weightKg` real,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`assignedProvider` text,
	`internalDeliveryId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_requests_orderId_unique` ON `delivery_requests` (`orderId`);--> statement-breakpoint
CREATE TABLE `guarantors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` text NOT NULL,
	`riderId` integer NOT NULL,
	`fullName` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`relationship` text NOT NULL,
	`idDocKey` text,
	`idDocUrl` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parcel_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` text NOT NULL,
	`parcelId` integer NOT NULL,
	`status` text NOT NULL,
	`location` text,
	`latitude` real,
	`longitude` real,
	`notes` text,
	`recordedById` integer NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parcels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` text NOT NULL,
	`trackingNumber` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`priority` text DEFAULT 'STANDARD' NOT NULL,
	`senderName` text NOT NULL,
	`senderPhone` text NOT NULL,
	`senderAddress` text NOT NULL,
	`recipientName` text NOT NULL,
	`recipientPhone` text NOT NULL,
	`recipientAddress` text NOT NULL,
	`recipientCity` text NOT NULL,
	`recipientState` text NOT NULL,
	`description` text,
	`weightGrams` integer DEFAULT 0 NOT NULL,
	`deliveryFeeKobo` integer DEFAULT 0 NOT NULL,
	`insuranceValueKobo` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'NGN' NOT NULL,
	`assignedAgentId` integer,
	`createdById` integer NOT NULL,
	`estimatedDeliveryAt` integer,
	`actualDeliveryAt` integer,
	`clientId` text,
	`tripId` text,
	`waybillId` text,
	`seatAssignmentStatus` text DEFAULT 'none' NOT NULL,
	`otpCode` text,
	`otpExpiresAt` integer,
	`otpVerifiedAt` integer,
	`recipientLat` real,
	`recipientLng` real,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`deletedAt` integer
);
--> statement-breakpoint
CREATE TABLE `proof_of_delivery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` text NOT NULL,
	`parcelId` integer NOT NULL,
	`imageUrl` text,
	`imageKey` text,
	`signatureUrl` text,
	`signatureKey` text,
	`receivedByName` text NOT NULL,
	`receivedByRelation` text DEFAULT 'Self' NOT NULL,
	`capturedById` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`deletedAt` integer
);
--> statement-breakpoint
CREATE TABLE `riders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` text NOT NULL,
	`userId` integer,
	`fullName` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`state` text NOT NULL,
	`lga` text NOT NULL,
	`vehicleType` text NOT NULL,
	`plateNumber` text NOT NULL,
	`licenseDocKey` text,
	`licenseDocUrl` text,
	`licenseExpiresAt` integer,
	`kycStatus` text DEFAULT 'PENDING' NOT NULL,
	`kycReference` text,
	`rejectionReason` text,
	`submittedAt` integer,
	`verifiedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);