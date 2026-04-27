

'use strict';
const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory state
/** @type {{name:string, swordType:string, ability:string, price:number}[]} */
const swords = [
  { name: 'testblade', swordType: 'saber', ability: 'Allows you to test any API.', price: 0.00 },
  { name: 'excalibur', swordType: 'longsword', ability: 'Become King', price: 999.99 },
  { name: 'honjo Masamune', swordType: 'katana', ability: 'idk', price: 499.99 },
  { name: 'sword in the Stone', swordType: '', ability: 'Swing the stone', price: 499.99 }
];

// Helpers

function normalizeString(value) {
  return String(value || '').toLowerCase().trim();
}

function isValidSwordType(value) {
    return typeof(value) == "string";
}

function isValidAbility(value) {
    return typeof(value) == "string";
}

function isValidPrice(value) {
  return typeof value === 'number' && isFinite(value) && value >= 0;
}

function isValidSword(name, swordType, ability, price) {
  return (
    normalizeString(name) !== '' &&
    isValidSwordType(swordType) &&
    isValidAbility(ability) &&
    isValidPrice(price)
  );
}

function createSword(name, swordType, ability, price) {
    return {
        name: name,
        swordType: swordType,
        ability: ability,
        price: price
    }
}

function findIndex(identifier) {
  const n = normalizeString(identifier);
  return swords.findIndex(s => s.name === n);
}

// Routes
app.head('/', (req, res) => {
  res.set('X-Swords-Count', String(swords.length));
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.status(200).json(swords);
});

app.get('/:name', (req, res) => {
  const idx = findIndex(req.params.name);

  if (idx === -1) {
    return res.status(404).json({ error: 'not found' });
  }

  res.status(200).json(swords[idx]);
});

app.post('/add', (req, res) => {
  const { name, swordType, ability, price } = req.body || {};

  const nName = normalizeString(name);
  if (!nName) {
    return res.status(400).json({ error: "name is required" });
  }

  if (nName == "") {
    return res.status(400).json({ error: "name is invalid" });
  }

  if (!swordType) {
    return res.status(400).json({ error: "swordType is required" });
  }

  if (!isValidSwordType(swordType)) {
    return res.status(400).json({ error: "swordType must be a string" });
  }

  if (!ability) {
    return res.status(400).json({ error: "ability is required" });
  }

  if (!isValidAbility(ability)) {
    return res.status(400).json({ error: "ability must be a string" });
  }

  if (!price) {
    return res.status(400).json({ error: "price is required" });
  }

  if (!isValidPrice(price)) {
    return res.status(400).json({ error: "price must be a finite number greater than or equal to 0" });
  }

  if (findIndex(nName) !== -1) {
    return res.status(409).json({ error: 'sword already exists' });
  }

  const newSword = createSword(nName, swordType, ability, price)
  swords.push(newSword);
  return res.status(201).json(newSword);
});

app.delete('/:name', (req, res) => {
  const idx = findIndex(req.params.name);
  
  if (idx === -1) {
    return res.status(404).json({ error: 'not found' });
  }

  swords.splice(idx, 1);

  return res.sendStatus(204);
});

app.listen(PORT, () => {
  console.log(`Swords API listening on http://localhost:${PORT}`);
});