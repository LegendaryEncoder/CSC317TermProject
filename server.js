'use strict';
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const initSqlJs = require('sql.js');
const bcrypt  = require('bcryptjs');
const session = require('express-session');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'sword-shop-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

const PORT    = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'swords.db');

// ── Middleware: expose session user to all templates ──────────────────────────
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ── Auth guards ───────────────────────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login?next=' + encodeURIComponent(req.path));
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.status(403).render('404', { identifier: 'Admin access required' });
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeString(v) { return String(v || '').toLowerCase().trim(); }
function isValidPrice(v)    { const n = Number(v); return isFinite(n) && n >= 0; }

function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

let db;
function saveDb() { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }

// ── Bootstrap ─────────────────────────────────────────────────────────────────
initSqlJs().then(SQL => {
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  // Migrate: add image_url if upgrading from older DB without it
  try { db.run('ALTER TABLE Swords ADD COLUMN image_url TEXT'); saveDb(); } catch(e) { /* column already exists */ }

  db.run(`CREATE TABLE IF NOT EXISTS Swords (
    name       TEXT PRIMARY KEY NOT NULL,
    sword_type TEXT NOT NULL,
    ability    TEXT NOT NULL,
    price      REAL NOT NULL CHECK(price >= 0),
    image_url  TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    phone      TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    is_admin   INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS CartItems (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    sword_name  TEXT NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
    FOREIGN KEY(user_id)    REFERENCES Users(id)  ON DELETE CASCADE,
    FOREIGN KEY(sword_name) REFERENCES Swords(name) ON DELETE CASCADE,
    UNIQUE(user_id, sword_name)
  )`);

  // Seed swords
  const swordStmt = db.prepare('INSERT OR IGNORE INTO Swords (name, sword_type, ability, price, image_url) VALUES (?,?,?,?,?)');
  [
    ['TESTBLADE', 'Saber', 'Allows you to test any API.', 0.00, "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSP0_pt5F0sdPDctonkMp6nJ_ZMZrXqaA-UhA&s"],
    ['Excalibur', 'Longsword', 'Become King', 999.99, "https://m.media-amazon.com/images/I/61bf1f3H1uL.jpg"],
    ['Honjo Masamune', 'Katana', 'idk', 499.99, "https://lh7-rt.googleusercontent.com/docsz/AD_4nXfRDTTFvMVGC-uSD9OweUyi2LLLn79WwOV3wVTl61fU0T3km0AVKgkaHh4PRTWqrqZLcG2IHPrj0FmcHQdODX2dvFX9DysMo0lkGS3R2w5T8Q2CmH3-BOQPxRJdllBnTcPyB8sf9g?key=sg5T4_04BkNnMYPWBv0Czogk"],
    ['Sword in the Stone', 'Longsword', 'Swing the stone', 499.99, "https://www.psychologicalscience.org/redesign/wp-content/uploads/2023/02/MarApr23-Sword-from-Stone.png.jpg"],
    ['Darkness', 'Katana', 'Conjures darkness from Darkness Island.', 249.99,   "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTGE7vOTOwHcIf_CBOPAg-Iw52BkBxGt4fWiQ&s"],
    ['Invisiblade', 'Unknown', 'This sword is completely invisible, even to the wielder!', 0.99, "https://images.rawpixel.com/image_800/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA1L3BmLXMxMjQtYWstMjYxNV8yLmpwZw.jpg"],
    ['Dark King Grûtmore\'s Edge of Annihilation', 'Greatsword', 'Splits apart realms with the souls of the slaughtered.', 999999.99, "https://media.craiyon.com/2025-10-10/dzNAy2LSQCOwcHEHvHXXfw.webp"],
    ['the throngler', 'Dagger', 'the fewer words a magic sword\'s name has, the more dangerous it is', 9876543.21, "https://irongatearmory.com/wp-content/uploads/2014/08/p-7301-V422-Dragon-Dagger_01_LRG.jpg"],
    ['Skywalker', 'Lightsaber', 'It\'s a literal lightsaber, does it really need any ability??', 599.99,  "https://upload.wikimedia.org/wikipedia/commons/d/d4/Lightsaber_Skywalker.png"],
    ['Cybernite', 'Gladius', 'This sword can summon and shoot lasers at whatever it points at.', 649.99, "https://media.sketchfab.com/models/83e6b6f189b140a0b9eee6d0998c8451/thumbnails/c9b816091c844674bdc41262c451c230/35d0b72b19cc4c6eaf1bc36487bf26e0.jpeg"],
    ['Necromancer\'s Fury', 'Claymore', 'The undead rises and obey those who wield this sword.', 599.99, "https://images.halloween.com/products/93235/1-1/inflatable-skull-sword-prop.jpg"],
    ['Baguette', 'Baguette', 'It\'s really stale.', 1.99, "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTd8-f7kAprwW7mCfyAHysOW7NYZ1SEyTXjug&s"]
  ].forEach(s => swordStmt.run(s));
  swordStmt.free();

  // Seed admin account (admin / admin123)
  const adminHash = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO Users (username, first_name, last_name, phone, email, password, is_admin)
          VALUES ('admin','Admin','User','0000000000','admin@swordshop.com',?,1)`, [adminHash]);

  saveDb();
  console.log('DB ready');

  app.listen(PORT, () => console.log('Listening on http://localhost:' + PORT));
}).catch(e => { console.error(e); process.exit(1); });

// ═════════════════════════════════════════════════════════════════════════════
// PAGE ROUTES
// ═════════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => res.render('home'));

// ── Products ──────────────────────────────────────────────────────────────────
app.get('/products', (req, res) => {
  const swords = rowsToObjects(db.exec('SELECT * FROM Swords'));
  res.render('products', { swords });
});

app.get('/products/:name', (req, res) => {
  const stmt = db.prepare('SELECT * FROM Swords WHERE name = ?');
  stmt.bind([req.params.name]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  if (!rows[0]) return res.status(404).render('404', { identifier: req.params.name });
  res.render('product-detail', { sword: rows[0] });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { next: req.query.next || '/', error: null, signupError: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const stmt = db.prepare('SELECT * FROM Users WHERE username = ?');
  stmt.bind([username]);
  let user = null;
  if (stmt.step()) user = stmt.getAsObject();
  stmt.free();

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { next: req.body.next || '/', error: 'Invalid username or password.', signupError: null });
  }
  req.session.user = { id: user.id, username: user.username, first_name: user.first_name, is_admin: !!user.is_admin };
  res.redirect(req.body.next || '/');
});

app.post('/signup', (req, res) => {
  const { username, first_name, last_name, phone, email, password, confirm_password } = req.body;

  if (!username || !first_name || !last_name || !phone || !email || !password) {
    return res.render('login', { next: '/', error: null, signupError: 'All fields are required.' });
  }
  if (password !== confirm_password) {
    return res.render('login', { next: '/', error: null, signupError: 'Passwords do not match.' });
  }
  if (password.length < 6) {
    return res.render('login', { next: '/', error: null, signupError: 'Password must be at least 6 characters.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    db.run(
      'INSERT INTO Users (username, first_name, last_name, phone, email, password) VALUES (?,?,?,?,?,?)',
      [username.trim(), first_name.trim(), last_name.trim(), phone.trim(), email.trim(), hash]
    );
    saveDb();
    // Log them in immediately
    const stmt = db.prepare('SELECT * FROM Users WHERE username = ?');
    stmt.bind([username.trim()]);
    let newUser = null;
    if (stmt.step()) newUser = stmt.getAsObject();
    stmt.free();
    req.session.user = { id: newUser.id, username: newUser.username, first_name: newUser.first_name, is_admin: false };
    res.redirect('/');
  } catch (err) {
    const msg = err.message.includes('UNIQUE') ? 'Username or email already taken.' : err.message;
    res.render('login', { next: '/', error: null, signupError: msg });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ── Profile ───────────────────────────────────────────────────────────────────
app.get('/profile', requireLogin, (req, res) => {
  const stmt = db.prepare('SELECT id,username,first_name,last_name,phone,email FROM Users WHERE id = ?');
  stmt.bind([req.session.user.id]);
  let profile = null;
  if (stmt.step()) profile = stmt.getAsObject();
  stmt.free();
  res.render('profile', { profile });
});

// ── Cart ──────────────────────────────────────────────────────────────────────
app.get('/cart', requireLogin, (req, res) => {
  const items = rowsToObjects(db.exec(
    `SELECT ci.id, ci.sword_name, ci.quantity, s.price, s.image_url,
            ROUND(ci.quantity * s.price, 2) as subtotal
     FROM CartItems ci
     JOIN Swords s ON s.name = ci.sword_name
     WHERE ci.user_id = ${req.session.user.id}
     ORDER BY ci.id`
  ));
  const total = items.reduce((sum, i) => sum + i.subtotal, 0).toFixed(2);
  res.render('cart', { items, total });
});

// ── Admin ─────────────────────────────────────────────────────────────────────
app.get('/admin', requireAdmin, (req, res) => {
  const users  = rowsToObjects(db.exec('SELECT id,username,first_name,last_name,email,phone,is_admin FROM Users ORDER BY id'));
  const swords = rowsToObjects(db.exec('SELECT * FROM Swords ORDER BY name'));
  res.render('admin', { users, swords });
});

// ═════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// ── Swords API ────────────────────────────────────────────────────────────────
app.head('/api/products', (req, res) => {
  const r = db.exec('SELECT COUNT(*) as count FROM Swords');
  res.set('X-Swords-Count', String(r[0].values[0][0]));
  res.sendStatus(200);
});

app.get('/api/products', (req, res) => {
  res.json(rowsToObjects(db.exec('SELECT * FROM Swords')));
});

app.get('/api/products/:name', (req, res) => {
  const stmt = db.prepare('SELECT * FROM Swords WHERE name = ?');
  stmt.bind([req.params.name]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.post('/api/products/add', requireAdmin, (req, res) => {
  const { name, swordType, ability, price, image_url } = req.body || {};
  const nName = normalizeString(name);
  if (!nName)    return res.status(400).json({ error: 'name is required' });
  if (!swordType) return res.status(400).json({ error: 'swordType is required' });
  if (!ability)  return res.status(400).json({ error: 'ability is required' });
  if (!isValidPrice(price)) return res.status(400).json({ error: 'invalid price' });
  try {
    db.run('INSERT INTO Swords (name, sword_type, ability, price, image_url) VALUES (?,?,?,?,?)',
      [nName, swordType, ability, Number(price), image_url || null]);
    saveDb();
    res.status(201).json({ name: nName, sword_type: swordType, ability, price: Number(price), image_url: image_url || null });
  } catch (err) {
    res.status(err.message.includes('UNIQUE') ? 409 : 500).json({ error: err.message });
  }
});

app.put('/api/products/:name', requireAdmin, (req, res) => {
  const { sword_type, ability, price, image_url, new_name } = req.body || {};
  const stmt = db.prepare('SELECT * FROM Swords WHERE name = ?');
  stmt.bind([req.params.name]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  if (!rows[0]) return res.status(404).json({ error: 'not found' });

  const s = rows[0];
  const updatedName     = new_name     ? normalizeString(new_name) : s.name;
  const updatedType     = sword_type   || s.sword_type;
  const updatedAbility  = ability      || s.ability;
  const updatedPrice    = price !== undefined ? Number(price) : s.price;
  const updatedImage    = image_url !== undefined ? (image_url || null) : s.image_url;

  try {
    db.run('UPDATE Swords SET name=?, sword_type=?, ability=?, price=?, image_url=? WHERE name=?',
      [updatedName, updatedType, updatedAbility, updatedPrice, updatedImage, req.params.name]);
    saveDb();
    res.json({ name: updatedName, sword_type: updatedType, ability: updatedAbility, price: updatedPrice, image_url: updatedImage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:name', requireAdmin, (req, res) => {
  const r = db.exec(`SELECT COUNT(*) FROM Swords WHERE name = '${req.params.name.replace(/'/g,"''")}'`);
  if (r[0].values[0][0] === 0) return res.status(404).json({ error: 'not found' });
  db.run('DELETE FROM Swords WHERE name = ?', [req.params.name]);
  saveDb();
  res.sendStatus(204);
});

// ── Cart API ──────────────────────────────────────────────────────────────────
app.post('/api/cart/add', requireLogin, (req, res) => {
  const { sword_name } = req.body;
  if (!sword_name) return res.status(400).json({ error: 'sword_name required' });

  // Check sword exists
  const sw = db.exec(`SELECT name, price FROM Swords WHERE name = ?`, [sword_name]);
  if (!sw.length) return res.status(404).json({ error: 'sword not found' });

  try {
    db.run(`INSERT INTO CartItems (user_id, sword_name, quantity) VALUES (?,?,1)
            ON CONFLICT(user_id, sword_name) DO UPDATE SET quantity = quantity + 1`,
      [req.session.user.id, sword_name]);
    saveDb();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cart/:id', requireLogin, (req, res) => {
  const { quantity } = req.body;
  const qty = parseInt(quantity);
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'quantity must be >= 1' });

  // Ensure item belongs to this user
  const check = db.exec(`SELECT id FROM CartItems WHERE id = ${parseInt(req.params.id)} AND user_id = ${req.session.user.id}`);
  if (!check.length || !check[0].values.length) return res.status(404).json({ error: 'not found' });

  db.run('UPDATE CartItems SET quantity = ? WHERE id = ?', [qty, parseInt(req.params.id)]);
  saveDb();

  // Return updated subtotal
  const item = rowsToObjects(db.exec(
    `SELECT ci.quantity, s.price, ROUND(ci.quantity * s.price, 2) as subtotal
     FROM CartItems ci JOIN Swords s ON s.name = ci.sword_name WHERE ci.id = ${parseInt(req.params.id)}`
  ))[0];
  res.json(item);
});

app.delete('/api/cart/:id', requireLogin, (req, res) => {
  const check = db.exec(`SELECT id FROM CartItems WHERE id = ${parseInt(req.params.id)} AND user_id = ${req.session.user.id}`);
  if (!check.length || !check[0].values.length) return res.status(404).json({ error: 'not found' });
  db.run('DELETE FROM CartItems WHERE id = ?', [parseInt(req.params.id)]);
  saveDb();
  res.sendStatus(204);
});

// ── Admin user API ────────────────────────────────────────────────────────────
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const uid = parseInt(req.params.id);
  if (uid === req.session.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.run('DELETE FROM Users WHERE id = ?', [uid]);
  saveDb();
  res.sendStatus(204);
});

app.use((req, res) => res.status(404).render('404', { identifier: req.path }));