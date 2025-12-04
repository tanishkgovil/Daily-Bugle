// Ad Service (MVP)
// Endpoint:
//   GET /ads  -> { ad: { id, html, clickUrl } }
// Behavior:
//   - If requester is an author (via auth-service cookie), return 204 (no ad).
//   - Otherwise return a random active ad from Mongo (or 204 if none).

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 4004;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/?appName=MongoDB+Compass&directConnection=true&serverSelectionTimeoutMS=2000';
const AUTH_URL = process.env.AUTH_URL || "http://localhost:4000"; // auth-service base
const DB_NAME = "dailybugle";

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

let Ads;

// --- DB connect & indexes
MongoClient.connect(MONGO_URL)
  .then((client) => {
    const db = client.db(DB_NAME);
    Ads = db.collection("ads");
    Ads.createIndex({ active: 1 }).catch(() => {});
    app.listen(PORT, () => console.log(`ad-service on :${PORT}`));
  })
  .catch((e) => {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  });

// --- Helpers
function toPublic(doc) {
  return {
    id: doc._id.toString(),
    html: doc.html,
    clickUrl: doc.clickUrl
  };
}

async function isAuthor(req) {
  // Ask auth-service who this is; if roles include 'author', we suppress ads.
  const cookie = req.headers.cookie || "";
  try {
    const r = await fetch(`${AUTH_URL}/me`, { headers: { cookie } });
    if (!r.ok) return false; // anonymous or not logged in => not author
    const data = await r.json();
    const roles = (data.user && data.user.roles) || [];
    return roles.includes("author");
  } catch {
    // If auth-service is unreachable, fail open (treat as non-author)
    return false;
  }
}

// --- Routes
app.get("/", async (req, res) => {
  if (await isAuthor(req)) return res.status(204).end();

  // Pick a random active ad. If you don't store "active", it will match all.
  const docs = await Ads.aggregate([
    { $match: { $or: [ { active: { $exists: false } }, { active: { $ne: false } } ] } },
    { $sample: { size: 1 } }
  ]).toArray();

  if (!docs.length) return res.status(204).end();
  res.json({ ad: toPublic(docs[0]) });
});

module.exports = app;