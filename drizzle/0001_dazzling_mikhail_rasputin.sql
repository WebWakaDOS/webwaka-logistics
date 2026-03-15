CREATE TABLE `parcel_updates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(64) NOT NULL,
	`parcelId` int NOT NULL,
	`status` enum('PENDING','COLLECTED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED') NOT NULL,
	`location` varchar(255),
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`notes` text,
	`recordedById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parcel_updates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parcels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(64) NOT NULL,
	`trackingNumber` varchar(32) NOT NULL,
	`status` enum('PENDING','COLLECTED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED') NOT NULL DEFAULT 'PENDING',
	`priority` enum('STANDARD','EXPRESS','SAME_DAY') NOT NULL DEFAULT 'STANDARD',
	`senderName` varchar(255) NOT NULL,
	`senderPhone` varchar(20) NOT NULL,
	`senderAddress` text NOT NULL,
	`recipientName` varchar(255) NOT NULL,
	`recipientPhone` varchar(20) NOT NULL,
	`recipientAddress` text NOT NULL,
	`recipientCity` varchar(100) NOT NULL,
	`recipientState` varchar(100) NOT NULL,
	`description` text,
	`weightGrams` int NOT NULL DEFAULT 0,
	`deliveryFeeKobo` bigint NOT NULL DEFAULT 0,
	`insuranceValueKobo` bigint NOT NULL DEFAULT 0,
	`currency` varchar(3) NOT NULL DEFAULT 'NGN',
	`assignedAgentId` int,
	`createdById` int NOT NULL,
	`estimatedDeliveryAt` timestamp,
	`actualDeliveryAt` timestamp,
	`clientId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `parcels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proof_of_delivery` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(64) NOT NULL,
	`parcelId` int NOT NULL,
	`imageUrl` text,
	`imageKey` varchar(512),
	`signatureUrl` text,
	`signatureKey` varchar(512),
	`receivedByName` varchar(255) NOT NULL,
	`receivedByRelation` varchar(100) NOT NULL DEFAULT 'Self',
	`capturedById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` timestamp,
	CONSTRAINT `proof_of_delivery_id` PRIMARY KEY(`id`)
);
