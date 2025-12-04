// Tiny static server + API proxy so the browser never hits internal services directly.
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 4006;

// --- Internal service bases (override with env in docker-compose)
const AUTH_BASE     = process.env.AUTH_BASE     || "http://localhost:4000";
const ARTICLE_BASE  = process.env.ARTICLE_BASE  || "http://localhost:4001";
const COMMENT_BASE  = process.env.COMMENT_BASE  || "http://localhost:4002";
const SEARCH_BASE   = process.env.SEARCH_BASE   || "http://localhost:4003";
const AD_BASE       = process.env.AD_BASE       || "http://localhost:4004";
const AD_EVENT_BASE = process.env.AD_EVENT_BASE || "http://localhost:4005";

// --- Static
app.use(express.static(path.join(__dirname, "public")));

// --- Proxy helpers (rewrite cookie Domain to current host)
const commonProxyCfg = (target) => ({
  target, changeOrigin: true,
  cookieDomainRewrite: "", // ensure Set-Cookie is for frontend host
  xfwd: true,              // pass X-Forwarded-* so services can record IPs
  logLevel: "warn",
  pathRewrite: { "^/api": "" }
});

// /api/auth/* -> auth-service
app.use("/api/auth", createProxyMiddleware(commonProxyCfg(AUTH_BASE)));

// /api/search -> search-service
app.use("/api/search", createProxyMiddleware(commonProxyCfg(SEARCH_BASE)));

// /api/ads -> ad-service
app.use("/api/ads", createProxyMiddleware(commonProxyCfg(AD_BASE)));

// /api/ad-event -> ad-event-service
app.use("/api/ad-event", createProxyMiddleware(commonProxyCfg(AD_EVENT_BASE)));

// /api/articles ... tricky because comments live under /articles/:id/comments
const articleProxy = createProxyMiddleware(commonProxyCfg(ARTICLE_BASE));
const commentProxy = createProxyMiddleware(commonProxyCfg(COMMENT_BASE));

app.use("/api/articles", (req, res, next) => {
  // Route /api/articles/:id/comments -> comment-service, everything else -> article-service
  if (/^\/api\/articles\/[^/]+\/comments/.test(req.originalUrl)) {
    return commentProxy(req, res, next);
  }
  return articleProxy(req, res, next);
});

// --- SPA-ish fallback for convenience
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/story.html", (req, res) => res.sendFile(path.join(__dirname, "public", "story.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/new_article.html", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "new_article.html")));

app.listen(PORT, () => console.log(`httpd-frontend on :${PORT}`));