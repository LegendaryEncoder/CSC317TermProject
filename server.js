

'use strict';
const express = require('express');
const path = require('path');
const app = express();
const sqlite3 = require("sqlite3").verbose();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pug configuration
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS)
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;



// In-memory state
/** @type {{name:string, swordType:string, ability:string, price:number}[]} */

/*
const swords = [
  { name: 'testblade', swordType: 'saber', ability: 'Allows you to test any API.', price: 0.00 },
  { name: 'excalibur', swordType: 'longsword', ability: 'Become King', price: 999.99 },
  { name: 'honjo Masamune', swordType: 'katana', ability: 'idk', price: 499.99 },
  { name: 'sword in the Stone', swordType: '', ability: 'Swing the stone', price: 499.99 }
];
*/

// Swords database:
const swordsDb = new sqlite3.Database("swords.db", (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log("Connected to the swords database.");
});

// Create the database if it doesn't exist:
swordsDb.run(`
  CREATE TABLE IF NOT EXISTS Swords (
    name TEXT PRIMARY KEY NOT NULL,
    sword_type TEXT NOT NULL,
    ability TEXT NOT NULL,
    price REAL NOT NULL CHECK(price >= 0)
  )
`, (err) => {
  if (err) {
    return console.error("Error creating table:", err.message);
  }
  console.log("Created Swords database");
});

const insertQuery = `
  INSERT INTO Swords (name, sword_type, ability, price)
  VALUES (?, ?, ?, ?)
`;

// Insert swords into the database:
if (true) {

  swordsDb.run(insertQuery, ["testblade", "saber", "Allows you to test any API.", 0.00], function(err) {
    if (err) {
      return console.error("Error inserting sword:", err.message);
    }
  });

  swordsDb.run(insertQuery, ["excalibur", "longsword", "Become King", 999.99], function(err) {
    if (err) {
      return console.error("Error inserting sword:", err.message);
    }
  });

  swordsDb.run(insertQuery, ["honjo masamune", "katana", "idk", 499.99], function(err) {
    if (err) {
      return console.error("Error inserting sword:", err.message);
    }
  });

  swordsDb.run(insertQuery, ["sword in the stone", "longsword", "Swing the stone", 499.99], function(err) {
    if (err) {
      return console.error("Error inserting sword:", err.message);
    }
  });

}

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
  return swords.findIndex(s => normalizeString(s.name) === n);
}

// Routes
// HEAD
app.head('/api/products', (req, res) => {
  res.set('X-Swords-Count', String(swords.length));
  res.sendStatus(200);
});

// GET
app.get('/', (req, res) => {
  res.render('home');
});

app.get('/products', (req, res) => {
  swordsDb.all("SELECT * FROM Swords", (err, swords) => {
    if (err) {
      return console.error("Error fetching swords:", err.message);
    }
    res.render('products', { swords });
  });
});

app.get('/products/:name', (req, res) => {
  swordsDb.all("SELECT * FROM Swords WHERE name = ?", [req.params.name], (err, swords) => {
    if (err) {
      return console.error("Error fetching swords:", err.message);
    }
    if (swords.length <= 0) {
      return res.render('404', { identifier: req.params.name });
    } else {
      res.render('product-detail', { sword: swords[0]});
    }
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/profile', (req, res) => {
  res.render('profile');
});

app.get('/cart', (req, res) => {
  res.render('cart');
});

app.get('/api/products', (req, res) => {
  // res.status(200).json(swords);

  swordsDb.all("SELECT * FROM Swords", (err, swords) => {
    if (err) {
      return console.error("Error fetching swords:", err.message);
    }
    res.status(200).json(swords);
  });
});

app.get('/api/products/:name', (req, res) => {
  /*
  const idx = findIndex(req.params.name);
  if (idx === -1) {
    return res.status(404).json({ error: 'not found' });
  }
  res.status(200).json(swords[idx]);
  */

  swordsDb.all("SELECT * FROM Swords WHERE name = ?", [req.params.name], (err, swords) => {
    if (err) {
      return console.error("Error fetching swords:", err.message);
    }
    if (swords.length <= 0) {
      return res.status(404).json({ error: 'not found' });
    } else {
      res.status(200).json(swords[0]);
    }
  });
});

// POST
app.post('/login', (req, res) => {
  res.redirect('/');
});

app.post('/api/products/add', (req, res) => {
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

  swordsDb.run(insertQuery, [nName, swordType, ability, price], function(err) {
    if (err) {
      return console.error("Error adding sword:", err.message);
    }
  });

  const newSword = createSword(nName, swordType, ability, price)
  // swords.push(newSword);
  return res.status(201).json(newSword);
});

// DELETE
app.delete('/api/products/:name', (req, res) => {
  /*const idx = findIndex(req.params.name);
  
  if (idx === -1) {
    return res.status(404).json({ error: 'not found' });
  }

  swords.splice(idx, 1);*/

  swordsDb.all("DELETE FROM Swords WHERE name = ?", [req.params.name], (err, swords) => {
    if (err) {
      return console.error("Error deleting swords:", err.message);
    }
    if (swords.length <= 0) {
      return res.status(404).json({ error: 'not found' });
    }
  });

  return res.sendStatus(204);
});

app.use((req, res) => {
  return res.status(404).render("404");
});

app.listen(PORT, () => {
  console.log(`Swords API listening on http://localhost:${PORT}`);
});