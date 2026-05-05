/**
 * Serveur Permanences & Back-Up
 * - Authentification par session avec bcrypt
 * - Persistance des données dans MongoDB Atlas
 * - Toutes les routes API protégées sauf /login
 */

const express    = require('express');
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const bodyParser = require('body-parser');
const path       = require('path');
const { MongoClient } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'perm-secret-changez-moi';

if (!MONGO_URI) {
  console.error('❌ MONGO_URI manquant. Définir la variable d\'environnement MONGO_URI.');
  process.exit(1);
}

// ─── Connexion MongoDB ────────────────────────────────────────────────────────
let db;
const client = new MongoClient(MONGO_URI);

async function connectDB() {
  await client.connect();
  db = client.db('permanences');
  console.log('✅ MongoDB Atlas connecté');

  // Initialiser les collections si vides
  const appData = db.collection('appdata');
  const existing = await appData.findOne({ _id: 'main' });
  if (!existing) {
    await appData.insertOne({
      _id: 'main',
      gestionnaires: [],
      feries: [
        {date:'2025-01-01',label:'Nouvel An'},
        {date:'2025-04-18',label:'Vendredi-Saint'},
        {date:'2025-04-21',label:'Lundi de Pâques'},
        {date:'2025-05-29',label:"Jeudi de l'Ascension"},
        {date:'2025-06-09',label:'Lundi de Pentecôte'},
        {date:'2025-09-11',label:'Jeûne genevois'},
        {date:'2025-12-25',label:'Noël'},
        {date:'2025-12-31',label:'Restauration de la République'},
        {date:'2026-01-01',label:'Nouvel An'},
        {date:'2026-04-03',label:'Vendredi-Saint'},
        {date:'2026-04-06',label:'Lundi de Pâques'},
        {date:'2026-05-14',label:"Jeudi de l'Ascension"},
        {date:'2026-05-25',label:'Lundi de Pentecôte'},
        {date:'2026-09-10',label:'Jeûne genevois'},
        {date:'2026-12-25',label:'Noël'},
        {date:'2026-12-31',label:'Restauration de la République'},
      ],
      archives: {}
    });
    console.log('✅ Données initiales créées');
  }

  // Initialiser admin par défaut
  const users = db.collection('users');
  const adminExists = await users.findOne({ username: 'admin' });
  if (!adminExists) {
    const hash = bcrypt.hashSync('Admin1234!', 10);
    await users.insertOne({ username: 'admin', password: hash, role: 'admin' });
    console.log('✅ Utilisateur admin créé — mot de passe : Admin1234!');
    console.log('⚠️  Changez ce mot de passe dès la première connexion !');
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(bodyParser.json({ limit: '10mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict'
  }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Non authentifié' });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });
    const user = await db.collection('users').findOne({ username });
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    req.session.user = { username: user.username, role: user.role };
    res.json({ ok: true, username: user.username, role: user.role });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ ok: true, user: req.session.user });
  } else {
    res.status(401).json({ ok: false });
  }
});

app.post('/api/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Champs manquants' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Minimum 8 caractères' });
    const user = await db.collection('users').findOne({ username: req.session.user.username });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
    await db.collection('users').updateOne(
      { username: req.session.user.username },
      { $set: { password: bcrypt.hashSync(newPassword, 10) } }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Gestion utilisateurs (admin uniquement)
app.get('/api/users', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const users = await db.collection('users').find({}).toArray();
  res.json(users.map(u => ({ username: u.username, role: u.role })));
});

app.post('/api/users', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });
  const existing = await db.collection('users').findOne({ username });
  if (existing) return res.status(409).json({ error: 'Utilisateur existant' });
  await db.collection('users').insertOne({
    username, password: bcrypt.hashSync(password, 10), role: 'user'
  });
  res.json({ ok: true });
});

app.delete('/api/users/:username', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { username } = req.params;
  if (username === req.session.user.username) return res.status(400).json({ error: 'Impossible de se supprimer soi-même' });
  await db.collection('users').deleteOne({ username });
  res.json({ ok: true });
});

// ─── DATA API ────────────────────────────────────────────────────────────────
app.get('/api/data', requireAuth, async (req, res) => {
  try {
    const doc = await db.collection('appdata').findOne({ _id: 'main' });
    res.json(doc || { gestionnaires: [], feries: [], archives: {} });
  } catch(e) { res.status(500).json({ error: 'Erreur lecture données' }); }
});

app.post('/api/data', requireAuth, async (req, res) => {
  try {
    const { gestionnaires, feries, archives } = req.body;
    await db.collection('appdata').updateOne(
      { _id: 'main' },
      { $set: { gestionnaires, feries, archives } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Erreur sauvegarde' }); }
});

// ─── FRONTEND ────────────────────────────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Toute route inconnue → login si non auth, sinon index
app.get('*', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── DÉMARRAGE ───────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Erreur connexion MongoDB:', err);
  process.exit(1);
});
