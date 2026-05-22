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
  ['TESTBLADE',                          'Saber',      'Allows you to test any API.',                                          0.00,       'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSP0_pt5F0sdPDctonkMp6nJ_ZMZrXqaA-UhA&s'],
  ['Excalibur',                          'Longsword',  'Become King',                                                          999.99,     'https://m.media-amazon.com/images/I/61bf1f3H1uL.jpg'],
  ['Honjo Masamune',                     'Katana',     'idk',                                                                  499.99,     'https://lh7-rt.googleusercontent.com/docsz/AD_4nXfRDTTFvMVGC-uSD9OweUyi2LLLn79WwOV3wVTl61fU0T3km0AVKgkaHh4PRTWqrqZLcG2IHPrj0FmcHQdODX2dvFX9DysMo0lkGS3R2w5T8Q2CmH3-BOQPxRJdllBnTcPyB8sf9g?key=sg5T4_04BkNnMYPWBv0Czogk'],
  ['Sword in the Stone',                 'Longsword',  'Swing the stone',                                                      499.99,     'https://www.psychologicalscience.org/redesign/wp-content/uploads/2023/02/MarApr23-Sword-from-Stone.png.jpg'],
  ['Darkness',                           'Katana',     'Conjures darkness from Darkness Island.',                              249.99,     'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTGE7vOTOwHcIf_CBOPAg-Iw52BkBxGt4fWiQ&s'],
  ['Invisiblade',                        'Unknown',    'This sword is completely invisible, even to the wielder!',            0.99,       'https://images.rawpixel.com/image_800/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA1L3BmLXMxMjQtYWstMjYxNV8yLmpwZw.jpg'],
  ["Dark King Grûtmore's Edge of Annihilation", 'Greatsword', 'Splits apart realms with the souls of the slaughtered.',      999999.99,  'https://media.craiyon.com/2025-10-10/dzNAy2LSQCOwcHEHvHXXfw.webp'],
  ['the throngler',                      'Dagger',     "the fewer words a magic sword's name has, the more dangerous it is",  9876543.21, 'https://irongatearmory.com/wp-content/uploads/2014/08/p-7301-V422-Dragon-Dagger_01_LRG.jpg'],
  ['Skywalker',                          'Lightsaber', "It's a literal lightsaber, does it really need any ability??",        599.99,     'https://upload.wikimedia.org/wikipedia/commons/d/d4/Lightsaber_Skywalker.png'],
  ['Cybernite',                          'Gladius',    'This sword can summon and shoot lasers at whatever it points at.',    649.99,     'https://media.sketchfab.com/models/83e6b6f189b140a0b9eee6d0998c8451/thumbnails/c9b816091c844674bdc41262c451c230/35d0b72b19cc4c6eaf1bc36487bf26e0.jpeg'],
  ["Necromancer's Fury",                 'Claymore',   'The undead rises and obey those who wield this sword.',               599.99,     'https://images.halloween.com/products/93235/1-1/inflatable-skull-sword-prop.jpg'],
  ['Baguette',                           'Baguette',   "It's really stale.",                                                  1.99,       'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTd8-f7kAprwW7mCfyAHysOW7NYZ1SEyTXjug&s'],
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