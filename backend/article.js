const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { MongoClient, ObjectId } = require("mongodb");
const DB_NAME = "dailybugle";

const PORT = process.env.PORT || 4001;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/?appName=MongoDB+Compass&directConnection=true&serverSelectionTimeoutMS=2000';
const AUTH_URL = process.env.AUTH_URL || "http://localhost:4000"; // auth-service base

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

let Articles;

// ---- DB bootstrap
MongoClient.connect(MONGO_URL)
  .then((client) => {
    const db = client.db(DB_NAME);
    Articles = db.collection("articles");
    Articles.createIndex({ createdAt: -1 }).catch(()=>{});
    Articles.createIndex({ categories: 1 }).catch(()=>{});
    app.listen(PORT, () => console.log(`article-service on :${PORT}`));
  })
  .catch((e) => {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  });

// ---- Helpers
function toPublic(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

async function getMeFromAuth(req) {
  // Forward the user's cookie to auth-service
  const cookie = req.headers.cookie || "";
  try {
    const r = await fetch(`${AUTH_URL}/me`, { headers: { cookie } });
    if (!r.ok) return null;
    const data = await r.json();
    return data.user || null;
  } catch {
    return null;
  }
}

async function requireAuthor(req, res, next) {
  const user = await getMeFromAuth(req);
  if (!user) return res.status(401).json({ error: "not authenticated" });
  const roles = user.roles || [];
  if (!roles.includes("author")) return res.status(403).json({ error: "forbidden" });
  req.user = user;
  next();
}

// ---- Routes

// List, filter by query
app.get("/", async (req, res) => {
  const { category } = req.query;
  const q = {};
  if (category) q.categories = String(category);
  const docs = await Articles.find(q).sort({ createdAt: -1 }).limit(50).toArray();
  res.json({ items: docs.map(toPublic) });
});

// Get by id
app.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "bad id" });
  const doc = await Articles.findOne({ _id: new ObjectId(id) });
  if (!doc) return res.status(404).json({ error: "not found" });
  res.json(toPublic(doc));
});

// Create (author-only)
app.post("/", requireAuthor, upload.single('image'), async (req, res) => {
  const { title, teaser, body, categories } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "title and body required" });
  
  let imageData = null;
  if (req.file) {
    const base64 = req.file.buffer.toString('base64');
    imageData = `data:${req.file.mimetype};base64,${base64}`;
  }
  
  const now = new Date();
  const doc = {
    title: String(title),
    teaser: teaser ? String(teaser) : "",
    body: String(body),
    categories: Array.isArray(categories) ? categories.map(String) : (categories ? String(categories).split(',').map(s => s.trim()).filter(Boolean) : []),
    imageUrl: imageData,
    createdAt: now,
    updatedAt: now
  };
  const r = await Articles.insertOne(doc);
  res.status(201).json({ id: r.insertedId.toString() });
});

// Update (author-only, partial)
app.patch("/:id", requireAuthor, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "bad id" });

  const allowed = ["title", "teaser", "body", "categories"];
  const set = {};
  for (const k of allowed) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) {
      if (k === "categories") set[k] = Array.isArray(req.body[k]) ? req.body[k].map(String) : (req.body[k] ? String(req.body[k]).split(',').map(s => s.trim()).filter(Boolean) : []);
      else set[k] = req.body[k] === null ? null : String(req.body[k]);
    }
  }
  
  if (req.file) {
    const base64 = req.file.buffer.toString('base64');
    set.imageUrl = `data:${req.file.mimetype};base64,${base64}`;
  }
  
  set.updatedAt = new Date();

  const r = await Articles.updateOne({ _id: new ObjectId(id) }, { $set: set });
  if (r.matchedCount === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

module.exports = app;