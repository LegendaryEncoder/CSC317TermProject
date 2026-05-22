'use strict';
/**
 * db.js
 * All database helper functions. Every function that touches sql.js lives
 * here so routes stay thin and readable.
 *
 * Pattern:
 *   - getDb() / setDb() let server.js inject the live instance after init.
 *   - Each exported function is named after the operation it performs and
 *     accepts plain values — no raw SQL leaks into routes.
 */

const fs     = require('fs');
const bcrypt = require('bcryptjs');
const { DB_PATH } = require('./init');

// Instance management

let _db = null;

/** Inject the initialised database instance (called once in server.js). */
function setDb(instance) { _db = instance; }

/** Retrieve the database instance (used internally by all helpers). */
function getDb() {
  if (!_db) throw new Error('Database not initialised — call setDb() first.');
  return _db;
}

// Core utilities

/**
 * Persist the current in-memory state to disk.
 * Call after every write operation.
 */
function save() {
  fs.writeFileSync(DB_PATH, Buffer.from(getDb().export()));
}

/**
 * Convert a sql.js exec() result array into plain objects.
 * Returns [] when the query matched no rows.
 *
 * @param {Array} result  — raw return value of db.exec()
 * @returns {Object[]}
 */
function toObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

/**
 * Run a prepared statement for a single row and return it (or null).
 * Automatically frees the statement.
 *
 * @param {string}  sql
 * @param {Array}   params
 * @returns {Object|null}
 */
function queryOne(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

/**
 * Run a prepared statement and return all matching rows.
 * Automatically frees the statement.
 *
 * @param {string}  sql
 * @param {Array}   params
 * @returns {Object[]}
 */
function queryAll(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/**
 * Execute a write statement (INSERT / UPDATE / DELETE).
 * Saves to disk automatically.
 *
 * @param {string}  sql
 * @param {Array}   params
 */
function run(sql, params = []) {
  getDb().run(sql, params);
  save();
}

// Validation helpers

/** Lowercase + trim a value, coercing to string. */
function normalizeString(v) {
  return String(v || '').toLowerCase().trim();
}

/** Returns true if v can represent a non-negative finite number. */
function isValidPrice(v) {
  const n = Number(v);
  return isFinite(n) && n >= 0;
}

// Sword queries

/** Return every sword. */
function getAllSwords() {
  return toObjects(getDb().exec('SELECT * FROM Swords ORDER BY name'));
}

/** Return a single sword by name, or null. */
function getSwordByName(name) {
  return queryOne('SELECT * FROM Swords WHERE name = ?', [name]);
}

/** Return the total number of swords. */
function getSwordCount() {
  const row = queryOne('SELECT COUNT(*) as count FROM Swords');
  return row ? row.count : 0;
}

/**
 * Insert a new sword. Throws on duplicate name (UNIQUE constraint).
 *
 * @param {{ name, swordType, ability, price, image_url }} fields
 * @returns {{ name, sword_type, ability, price, image_url }}
 */
function createSword({ name, swordType, ability, price, image_url = null }) {
  const nName = normalizeString(name);
  run(
    'INSERT INTO Swords (name, sword_type, ability, price, image_url) VALUES (?,?,?,?,?)',
    [nName, swordType, ability, Number(price), image_url || null]
  );
  return { name: nName, sword_type: swordType, ability, price: Number(price), image_url: image_url || null };
}

/**
 * Update an existing sword. Only provided fields are changed.
 * Returns the updated row, or null if the sword didn't exist.
 *
 * @param {string} originalName
 * @param {{ new_name?, sword_type?, ability?, price?, image_url? }} fields
 * @returns {Object|null}
 */
function updateSword(originalName, { new_name, sword_type, ability, price, image_url } = {}) {
  const existing = getSwordByName(originalName);
  if (!existing) return null;

  const updated = {
    name:      new_name    ? normalizeString(new_name) : existing.name,
    sword_type: sword_type  || existing.sword_type,
    ability:   ability     || existing.ability,
    price:     price !== undefined ? Number(price) : existing.price,
    image_url: image_url   !== undefined ? (image_url || null) : existing.image_url,
  };

  run(
    'UPDATE Swords SET name=?, sword_type=?, ability=?, price=?, image_url=? WHERE name=?',
    [updated.name, updated.sword_type, updated.ability, updated.price, updated.image_url, originalName]
  );
  return updated;
}

/**
 * Delete a sword by name.
 * Returns true if a row was deleted, false if it didn't exist.
 *
 * @param {string} name
 * @returns {boolean}
 */
function deleteSword(name) {
  if (!getSwordByName(name)) return false;
  run('DELETE FROM Swords WHERE name = ?', [name]);
  return true;
}

// User queries

/** Return every user (password hash excluded). */
function getAllUsers() {
  return toObjects(getDb().exec(
    'SELECT id, username, first_name, last_name, email, phone, is_admin FROM Users ORDER BY id'
  ));
}

/** Return a single user's public profile (no password hash). */
function getUserById(id) {
  return queryOne(
    'SELECT id, username, first_name, last_name, phone, email FROM Users WHERE id = ?',
    [id]
  );
}

/** Return a full user row including password hash (for auth only). */
function getUserByUsername(username) {
  return queryOne('SELECT * FROM Users WHERE username = ?', [username]);
}

/**
 * Create a new user. Throws on duplicate username/email.
 * Returns the new user's session-safe fields.
 *
 * @param {{ username, first_name, last_name, phone, email, password }} fields
 * @returns {{ id, username, first_name, is_admin }}
 */
function createUser({ username, first_name, last_name, phone, email, password }) {
  const hash = bcrypt.hashSync(password, 10);
  run(
    'INSERT INTO Users (username, first_name, last_name, phone, email, password) VALUES (?,?,?,?,?,?)',
    [username.trim(), first_name.trim(), last_name.trim(), phone.trim(), email.trim(), hash]
  );
  const newUser = getUserByUsername(username.trim());
  return { id: newUser.id, username: newUser.username, first_name: newUser.first_name, is_admin: false };
}

/**
 * Verify a password against a stored hash.
 *
 * @param {string} plaintext
 * @param {string} hash
 * @returns {boolean}
 */
function verifyPassword(plaintext, hash) {
  return bcrypt.compareSync(plaintext, hash);
}

/**
 * Delete a user by id. Returns false if not found.
 *
 * @param {number} id
 * @returns {boolean}
 */
function deleteUser(id) {
  if (!getUserById(id)) return false;
  run('DELETE FROM Users WHERE id = ?', [id]);
  return true;
}

// Cart queries

/**
 * Return all cart items for a user, joined with sword price data.
 *
 * @param {number} userId
 * @returns {{ id, sword_name, quantity, price, image_url, subtotal }[]}
 */
function getCartByUser(userId) {
  return toObjects(getDb().exec(
    `SELECT ci.id, ci.sword_name, ci.quantity, s.price, s.image_url,
            ROUND(ci.quantity * s.price, 2) AS subtotal
     FROM CartItems ci
     JOIN Swords s ON s.name = ci.sword_name
     WHERE ci.user_id = ${parseInt(userId)}
     ORDER BY ci.id`
  ));
}

/**
 * Add a sword to a user's cart, or increment quantity if already present.
 * Returns false if the sword doesn't exist.
 *
 * @param {number} userId
 * @param {string} swordName
 * @returns {boolean}
 */
function addToCart(userId, swordName) {
  if (!getSwordByName(swordName)) return false;
  run(
    `INSERT INTO CartItems (user_id, sword_name, quantity) VALUES (?,?,1)
     ON CONFLICT(user_id, sword_name) DO UPDATE SET quantity = quantity + 1`,
    [userId, swordName]
  );
  return true;
}

/**
 * Update the quantity of a cart item. Verifies ownership.
 * Returns the updated { quantity, price, subtotal } or null if not found.
 *
 * @param {number} itemId
 * @param {number} userId   — used to verify ownership
 * @param {number} quantity — must be >= 1
 * @returns {Object|null}
 */
function updateCartItem(itemId, userId, quantity) {
  const owned = queryOne(
    'SELECT id FROM CartItems WHERE id = ? AND user_id = ?',
    [itemId, userId]
  );
  if (!owned) return null;

  run('UPDATE CartItems SET quantity = ? WHERE id = ?', [quantity, itemId]);

  return queryOne(
    `SELECT ci.quantity, s.price, ROUND(ci.quantity * s.price, 2) AS subtotal
     FROM CartItems ci JOIN Swords s ON s.name = ci.sword_name
     WHERE ci.id = ?`,
    [itemId]
  );
}

/**
 * Remove a cart item. Verifies ownership.
 * Returns true on success, false if not found or not owned.
 *
 * @param {number} itemId
 * @param {number} userId
 * @returns {boolean}
 */
function removeFromCart(itemId, userId) {
  const owned = queryOne(
    'SELECT id FROM CartItems WHERE id = ? AND user_id = ?',
    [itemId, userId]
  );
  if (!owned) return false;
  run('DELETE FROM CartItems WHERE id = ?', [itemId]);
  return true;
}

// Exports

module.exports = {
  // Instance
  setDb, getDb,
  // Core utilities
  save, toObjects, queryOne, queryAll, run,
  // Validation
  normalizeString, isValidPrice,
  // Swords
  getAllSwords, getSwordByName, getSwordCount,
  createSword, updateSword, deleteSword,
  // Users
  getAllUsers, getUserById, getUserByUsername,
  createUser, verifyPassword, deleteUser,
  // Cart
  getCartByUser, addToCart, updateCartItem, removeFromCart,
};