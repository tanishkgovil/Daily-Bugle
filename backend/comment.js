// Comment Service (MVP)
// Endpoints:
//   GET  /articles/:id/comments                (public)
//   POST /articles/:id/comments                (authenticated)
//
// Data model (collection: comments):
//   { _id, article_id:ObjectId, user_id:ObjectId, comment:String, createdAt:Date }

const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 4002;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/?appName=MongoDB+Compass&directConnection=true&serverSelectionTimeoutMS=2000';
const AUTH_URL = process.env.AUTH_URL || "http://localhost:4000"; // auth-service base
const DB_NAME = "dailybugle";

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

let Comments;

// --- DB connect & indexes
MongoClient.connect(MONGO_URL)
  .then((client) => {
    const db = client.db(DB_NAME);
    Comments = db.collection("comments");
    Comments.createIndex({ article_id: 1, createdAt: -1 }).catch(() => {});
    app.listen(PORT, () => console.log(`comment-service on :${PORT}`));
  })
  .catch((e) => {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  });

// --- Helpers
function toPublic(doc) {
  if (!doc) return null;
  const { _id, article_id, user_id, comment, createdAt } = doc;
  return {
    id: _id.toString(),
    article_id: article_id.toString(),
    user_id: user_id.toString(),
    comment,
    createdAt
  };
}

async function getMeFromAuth(req) {
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

async function requireAuth(req, res, next) {
  const me = await getMeFromAuth(req);
  if (!me) return res.status(401).json({ error: "not authenticated" });
  req.user = me; // { id, username, roles }
  next();
}

// --- Routes

// List comments for an article (public)
app.get("/:id/comments", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "bad article id" });

  const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);
  const docs = await Comments.find({ article_id: new ObjectId(id) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  res.json({ items: docs.map(toPublic) });
});

// Create a comment (authenticated)
app.post("/:id/comments", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "bad article id" });

  const text = (req.body && req.body.comment) ? String(req.body.comment).trim() : "";
  if (!text) return res.status(400).json({ error: "comment required" });

  const doc = {
    article_id: new ObjectId(id),
    user_id: new ObjectId(req.user.id),
    comment: text,
    createdAt: new Date()
  };

  const r = await Comments.insertOne(doc);
  res.status(201).json({ id: r.insertedId.toString() });
});

module.exports = app;