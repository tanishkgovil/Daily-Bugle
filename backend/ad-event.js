// Ad Event Service (MVP)
// Endpoints:
//   POST /ad-event     (primary)
//   POST /ad-service   (alias)
// Body:
//   { ad_id, article_id, event_type } where event_type in {"impression","click"}
// Automatically records: user_id | anon, user_label, req.ip, user-agent, created_at
//
// Data model (collection: ad_events):
//   { _id, ad_id:String, article_id:String, event_type:String,
//     user_id:String|null, user_label:"user"|"anon", ip:String, user_agent:String, created_at:Date }

const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const DB_NAME = "dailybugle";

const PORT = process.env.PORT || 4005;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/?appName=MongoDB+Compass&directConnection=true&serverSelectionTimeoutMS=2000';
const AUTH_URL = process.env.AUTH_URL || "http://localhost:4000"; // auth-service base

const app = express();
app.set("trust proxy", true); // so req.ip reflects X-Forwarded-For if behind proxy
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

let Events;

// ---- DB
MongoClient.connect(MONGO_URL)
  .then(client => {
    const db = client.db(DB_NAME);
    Events = db.collection("ad_events");
    Events.createIndex({ created_at: -1 }).catch(()=>{});
    Events.createIndex({ ad_id: 1, event_type: 1 }).catch(()=>{});
    app.listen(PORT, () => console.log(`ad-event-service on :${PORT}`));
  })
  .catch(e => {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  });

// ---- Helpers
async function getMeFromAuth(req) {
  const cookie = req.headers.cookie || "";
  try {
    const r = await fetch(`${AUTH_URL}/me`, { headers: { cookie } });
    if (!r.ok) return null;
    const data = await r.json();
    return data.user || null; // { id, username, roles }
  } catch {
    return null;
  }
}

function validateEvent(body) {
  const ad_id = (body && body.ad_id) ? String(body.ad_id).trim() : "";
  const article_id = (body && body.article_id) ? String(body.article_id).trim() : "";
  const event_type = (body && body.event_type) ? String(body.event_type).trim() : "";
  const okType = event_type === "impression" || event_type === "click";
  if (!ad_id || !article_id || !okType) return null;
  return { ad_id, article_id, event_type };
}

async function recordEvent(req, res) {
  const input = validateEvent(req.body);
  if (!input) return res.status(400).json({ error: "ad_id, article_id, and event_type (impression|click) are required" });

  const me = await getMeFromAuth(req);
  const doc = {
    ad_id: input.ad_id,
    article_id: input.article_id,
    event_type: input.event_type,
    user_id: me ? String(me.id) : null,
    user_label: me ? "user" : "anon",
    ip: req.ip || "",
    user_agent: req.headers["user-agent"] || "",
    created_at: new Date()
  };

  const r = await Events.insertOne(doc);
  return res.status(201).json({ id: r.insertedId.toString() });
}

// ---- Routes
app.post("/", recordEvent);
// alias to match earlier note
app.post("/ad-service", recordEvent);

module.exports = app;