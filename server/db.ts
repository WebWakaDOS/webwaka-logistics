import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../drizzle/schema";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "local.db");

let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!_db) {
    try {
      const sqlite = new Database(DB_PATH);
      sqlite.pragma("journal_mode = WAL");
      _db = drizzle(sqlite, { schema });
      runMigrations(sqlite);
    } catch (error) {
      process.stderr.write(`[Database] Failed to open: ${error}\n`);
      _db = null;
    }
  }
  return _db;
}

function runMigrations(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openId TEXT NOT NULL UNIQUE,
      name TEXT,
      email TEXT,
      loginMethod TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      lastSignedIn INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS parcels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenantId TEXT NOT NULL,
      trackingNumber TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      priority TEXT NOT NULL DEFAULT 'STANDARD',
      senderName TEXT NOT NULL,
      senderPhone TEXT NOT NULL,
      senderAddress TEXT NOT NULL,
      recipientName TEXT NOT NULL,
      recipientPhone TEXT NOT NULL,
      recipientAddress TEXT NOT NULL,
      recipientCity TEXT NOT NULL,
      recipientState TEXT NOT NULL,
      description TEXT,
      weightGrams INTEGER NOT NULL DEFAULT 0,
      deliveryFeeKobo INTEGER NOT NULL DEFAULT 0,
      insuranceValueKobo INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'NGN',
      assignedAgentId INTEGER,
      createdById INTEGER NOT NULL,
      estimatedDeliveryAt INTEGER,
      actualDeliveryAt INTEGER,
      clientId TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      deletedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS parcel_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenantId TEXT NOT NULL,
      parcelId INTEGER NOT NULL,
      status TEXT NOT NULL,
      location TEXT,
      latitude REAL,
      longitude REAL,
      notes TEXT,
      recordedById INTEGER NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS proof_of_delivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenantId TEXT NOT NULL,
      parcelId INTEGER NOT NULL,
      imageUrl TEXT,
      imageKey TEXT,
      signatureUrl TEXT,
      signatureKey TEXT,
      receivedByName TEXT NOT NULL,
      receivedByRelation TEXT NOT NULL DEFAULT 'Self',
      capturedById INTEGER NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      deletedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS delivery_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId TEXT NOT NULL UNIQUE,
      tenantId TEXT NOT NULL,
      sourceModule TEXT NOT NULL,
      vendorId TEXT,
      pickupAddress TEXT NOT NULL,
      deliveryAddress TEXT NOT NULL,
      itemsSummary TEXT NOT NULL,
      weightKg REAL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      assignedProvider TEXT,
      internalDeliveryId TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

export { getDb };

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = getDb();
  if (!db) {
    process.stderr.write("[Database] Cannot upsert user: database not available\n");
    return;
  }

  try {
    const now = new Date();
    const values: InsertUser = {
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: user.role ?? (user.openId === ENV.ownerOpenId ? 'admin' : 'user'),
      lastSignedIn: user.lastSignedIn ?? now,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: {
        name: values.name,
        email: values.email,
        loginMethod: values.loginMethod,
        role: values.role,
        lastSignedIn: values.lastSignedIn,
        updatedAt: now,
      },
    }).run();
  } catch (error) {
    process.stderr.write(`[Database] Failed to upsert user: ${error}\n`);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  if (!db) {
    process.stderr.write("[Database] Cannot get user: database not available\n");
    return undefined;
  }

  const result = db.select().from(users).where(eq(users.openId, openId)).limit(1).all();

  return result.length > 0 ? result[0] : undefined;
}
