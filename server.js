'use strict';
/**
 * server.js
 * Express app routes only.
 */

const express    = require('express');
const path       = require('path');
const session    = require('express-session');
const initSqlJs  = require('sql.js');
const { initDb } = require('./init');
const db         = require('./db');

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
  cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
}));

const PORT = process.env.PORT || 3000;

// Expose session user to all Pug templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Auth guards
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login?next=' + encodeURIComponent(req.path));
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user?.is_admin) return res.status(403).render('404', { identifier: 'Admin access required' });
  next();
}

// Startup 
// Startup
initSqlJs().then(SQL => {
  db.setDb(initDb(SQL));
  app.listen(PORT, () => console.log('Listening on http://localhost:' + PORT));
}).catch(err => { console.error(err); process.exit(1); });


// PAGE ROUTES

app.get('/', (req, res) => res.render('home'));

// Products
app.get('/products', (req, res) => {
  res.render('products', { swords: db.getAllSwords() });
});

app.get('/products/:name', (req, res) => {
  const sword = db.getSwordByName(req.params.name);
  if (!sword) return res.status(404).render('404', { identifier: req.params.name });
  res.render('product-detail', { sword });
});

// Auth
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { next: req.query.next || '/', error: null, signupError: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.getUserByUsername(username);

  if (!user || !db.verifyPassword(password, user.password)) {
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

  try {
    const sessionUser = db.createUser({ username, first_name, last_name, phone, email, password });
    req.session.user = sessionUser;
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

// Profile
app.get('/profile', requireLogin, (req, res) => {
  res.render('profile', { profile: db.getUserById(req.session.user.id) });
});

// Cart
app.get('/cart', requireLogin, (req, res) => {
  const items = db.getCartByUser(req.session.user.id);
  const total = items.reduce((sum, i) => sum + i.subtotal, 0).toFixed(2);
  res.render('cart', { items, total });
});

// Admin
app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin', { users: db.getAllUsers(), swords: db.getAllSwords() });
});


// API ROUTES


// Swords
app.head('/api/products', (req, res) => {
  res.set('X-Swords-Count', String(db.getSwordCount()));
  res.sendStatus(200);
});

app.get('/api/products', (req, res) => {
  res.json(db.getAllSwords());
});

app.get('/api/products/:name', (req, res) => {
  const sword = db.getSwordByName(req.params.name);
  if (!sword) return res.status(404).json({ error: 'not found' });
  res.json(sword);
});

app.post('/api/products/add', requireAdmin, (req, res) => {
  const { name, swordType, ability, price, image_url } = req.body || {};
  if (!db.normalizeString(name))  return res.status(400).json({ error: 'name is required' });
  if (!swordType)                 return res.status(400).json({ error: 'swordType is required' });
  if (!ability)                   return res.status(400).json({ error: 'ability is required' });
  if (!db.isValidPrice(price))    return res.status(400).json({ error: 'invalid price' });
  try {
    res.status(201).json(db.createSword({ name, swordType, ability, price, image_url }));
  } catch (err) {
    res.status(err.message.includes('UNIQUE') ? 409 : 500).json({ error: err.message });
  }
});

app.put('/api/products/:name', requireAdmin, (req, res) => {
  const updated = db.updateSword(req.params.name, req.body);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

app.delete('/api/products/:name', requireAdmin, (req, res) => {
  if (!db.deleteSword(req.params.name)) return res.status(404).json({ error: 'not found' });
  res.sendStatus(204);
});

// Cart
app.post('/api/cart/add', requireLogin, (req, res) => {
  const { sword_name } = req.body;
  if (!sword_name) return res.status(400).json({ error: 'sword_name required' });
  if (!db.addToCart(req.session.user.id, sword_name)) return res.status(404).json({ error: 'sword not found' });
  res.json({ ok: true });
});

app.put('/api/cart/:id', requireLogin, (req, res) => {
  const qty = parseInt(req.body.quantity);
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'quantity must be >= 1' });
  const item = db.updateCartItem(parseInt(req.params.id), req.session.user.id, qty);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

app.delete('/api/cart/:id', requireLogin, (req, res) => {
  if (!db.removeFromCart(parseInt(req.params.id), req.session.user.id)) return res.status(404).json({ error: 'not found' });
  res.sendStatus(204);
});

// Admin users
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const uid = parseInt(req.params.id);
  if (uid === req.session.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  if (!db.deleteUser(uid)) return res.status(404).json({ error: 'not found' });
  res.sendStatus(204);
});

// 404 fallback
app.use((req, res) => res.status(404).render('404', { identifier: req.path }));