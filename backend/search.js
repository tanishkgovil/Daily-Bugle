// Search Service (MVP)
// Endpoint:
//   GET /search?q=heart+health   -> { items: [...] }
//
// Uses the same "articles" collection schema as article-service:
// { _id, title, teaser, body, categories[], imageUrl, createdAt, updatedAt }

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 4003;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/?appName=MongoDB+Compass&directConnection=true&serverSelectionTimeoutMS=2000';
const DB_NAME = "dailybugle";

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

let Articles;

// ---- Connect DB & ensure text index
MongoClient.connect(MONGO_URL)
  .then(client => {
    const db = client.db(DB_NAME);
    Articles = db.collection("articles");
    // Text index for title/body/categories
    return Articles.createIndex(
      { title: "text", body: "text", categories: "text" },
      { name: "articles_text_idx", default_language: "english" }
    );
  })
  .catch(() => {}) // index might already exist
  .finally(() => {
    app.listen(PORT, () => console.log(`search-service on :${PORT}`));
  });

// ---- Helpers
function toPublic(doc) {
  // keep payload small for search list
  return {
    id: doc._id.toString(),
    title: doc.title,
    teaser: doc.teaser || "",
    categories: doc.categories || [],
    imageUrl: doc.imageUrl || null,
    createdAt: doc.createdAt,
    score: doc.score // textScore (useful for debugging or ranking on FE)
  };
}

// ---- Routes
app.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ items: [] });

  const limit = Math.min(parseInt(req.query.limit || "20", 10) || 20, 50);

  // Text search with score; sort by score (then by recency as tie-breaker)
  const cursor = Articles.find(
    { $text: { $search: q } },
    {
      projection: {
        title: 1, teaser: 1, body: 1, categories: 1, imageUrl: 1, createdAt: 1,
        score: { $meta: "textScore" }
      }
    }
  ).sort({ score: { $meta: "textScore" }, createdAt: -1 }).limit(limit);

  const docs = await cursor.toArray();
  res.json({ items: docs.map(toPublic) });
});

module.exports = app;