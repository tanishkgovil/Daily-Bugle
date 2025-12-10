const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 4000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/?appName=MongoDB+Compass&directConnection=true&serverSelectionTimeoutMS=2000';
const COOKIE_NAME = process.env.COOKIE_NAME || "session"; // stores userId
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true"; // set true in prod behind https
const DB_NAME = "dailybugle";

const app = express();
app.use(express.json());
app.use(cookieParser());

// Frontend can be on a different origin; allow cookies to flow.
app.use(cors({ origin: true, credentials: true }));

let users;

// Connect to Mongo then start server
MongoClient.connect(MONGO_URL)
  .then(client => {
    users = client.db(DB_NAME).collection("users");
    return users.createIndex({ username: 1 }, { unique: true });
  })
  .catch(() => {})
  .finally(() => {
    app.listen(PORT, () => console.log(`auth-service listening on :${PORT}`));
  });

// Helpers
async function getUserFromCookie(req) {
  const sid = req.cookies[COOKIE_NAME];
  if (!sid) return null;
  try {
    const user = await users.findOne(
      { _id: new ObjectId(sid) },
      { projection: { password: 0 } }
    );
    return user || null;
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const user = await getUserFromCookie(req);
  if (!user) return res.status(401).json({ error: "not authenticated" });
  req.user = user;
  next();
}

// Routes

// Very basic: stores plaintext password. Role defaults to "user".
app.post("/register", async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }
  const doc = {
    username: String(username).trim().toLowerCase(),
    password: String(password),
    roles: [role === "author" ? "author" : "user"],
    createdAt: new Date()
  };

  try {
    const r = await users.insertOne(doc);
    res.cookie(COOKIE_NAME, r.insertedId.toString(), {
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE,
      path: "/"
    });
    res.json({ ok: true, id: r.insertedId.toString() });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "username exists" });
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }
  const user = await users.findOne({ username: String(username).trim().toLowerCase() });
  if (!user || user.password !== String(password)) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  res.cookie(COOKIE_NAME, user._id.toString(), {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/"
  });
  res.json({ ok: true });
});

app.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.get("/me", requireAuth, (req, res) => {
  const u = req.user;
  res.json({ user: { id: u._id.toString(), username: u.username, roles: u.roles } });
});

app.get("/needs-author", requireAuth, (req, res) => {
  const roles = req.user.roles || [];
  if (!roles.includes("author")) return res.status(403).json({ error: "forbidden" });
  res.json({ ok: true });
});