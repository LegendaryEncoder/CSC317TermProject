'use strict';
/**
 * init.js
 * Initialises the sql.js database: creates tables, runs migrations,
 * and seeds default data. Call once at startup, before the server listens.
 *
 * Exports: initDb(SQL) => db instance
 */

const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'swords.db');

// Schema

// All three tables created in one transaction for atomicity and speed.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS Swords (
    name       TEXT PRIMARY KEY NOT NULL,
    sword_type TEXT NOT NULL,
    ability    TEXT NOT NULL,
    price      REAL NOT NULL CHECK(price >= 0),
    image_url  TEXT
  );

  CREATE TABLE IF NOT EXISTS Users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    phone      TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    is_admin   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS CartItems (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    sword_name TEXT NOT NULL,
    quantity   INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
    FOREIGN KEY(user_id)    REFERENCES Users(id)   ON DELETE CASCADE,
    FOREIGN KEY(sword_name) REFERENCES Swords(name) ON DELETE CASCADE,
    UNIQUE(user_id, sword_name)
  );
`;

// Seed data

const DEFAULT_SWORDS = [
  ['testblade',          'saber',     'Allows you to test any API.', 0.00,   null],
  ['excalibur',          'longsword', 'Become King',                 999.99, null],
  ['honjo masamune',     'katana',    'idk',                         499.99, null],
  ['sword in the stone', 'longsword', 'Swing the stone',             499.99, null],
];

const ADMIN = {
  username:   'admin',
  first_name: 'Admin',
  last_name:  'User',
  phone:      '0000000000',
  email:      'admin@swordshop.com',
  password:   'admin123',
};

// Migrations
// Add new columns here as the schema evolves. Each entry is attempted
// silently — SQLite throws if the column already exists, which is fine.

const MIGRATIONS = [
  'ALTER TABLE Swords ADD COLUMN image_url TEXT',
];

// Public API

/**
 * Load (or create) the database, apply migrations, create tables,
 * and seed default rows. Returns the ready sql.js Database instance.
 *
 * @param {import('sql.js').SqlJsStatic} SQL  — the resolved sql.js module
 * @returns {import('sql.js').Database}
 */
function initDb(SQL) {
  // Load existing file or start fresh
  const db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  // Run migrations first (may fail silently if columns already exist)
  for (const migration of MIGRATIONS) {
    try { db.run(migration); } catch (_) { /* already applied */ }
  }

  // Create tables
  db.run(SCHEMA);

  // Seed swords
  const swordStmt = db.prepare(
    'INSERT OR IGNORE INTO Swords (name, sword_type, ability, price, image_url) VALUES (?,?,?,?,?)'
  );
  for (const sword of DEFAULT_SWORDS) swordStmt.run(sword);
  swordStmt.free();

  // Seed admin account
  const adminHash = bcrypt.hashSync(ADMIN.password, 10);
  db.run(
    `INSERT OR IGNORE INTO Users
       (username, first_name, last_name, phone, email, password, is_admin)
     VALUES (?,?,?,?,?,?,1)`,
    [ADMIN.username, ADMIN.first_name, ADMIN.last_name, ADMIN.phone, ADMIN.email, adminHash]
  );

  // Persist to disk
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('DB ready —', DB_PATH);

  return db;
}

module.exports = { initDb, DB_PATH };