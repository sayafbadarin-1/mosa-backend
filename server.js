// server.js (محدّث: users, auth, sessions, roles)
const express = require("express");
const fs = require("fs").promises;
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = ".";
const BOOKS_DB = path.join(DATA_DIR, "books.json");
const TIPS_DB = path.join(DATA_DIR, "tips.json");
const POSTS_DB = path.join(DATA_DIR, "posts.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json"); // legacy compatibility
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const ENV_ADMIN_PASS = process.env.ADMIN_PASS || "sayaf1820";
const DEFAULT_SUPERADMIN_USERNAME = "sayafbadarin";

async function readJson(filePath) {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt || "null");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
async function readArray(file) {
  const txt = await readJson(file);
  return Array.isArray(txt) ? txt : [];
}

/* ===== legacy admin password (admin.json) ===== */
async function getStoredAdminPass() {
  try {
    const obj = await readJson(ADMIN_FILE);
    if (obj && obj.password) return obj.password;
  } catch (err) {
    console.error("getStoredAdminPass read error:", err);
  }
  return ENV_ADMIN_PASS;
}

/* ===== sessions helpers ===== */
async function ensureFile(filePath, defaultContent) {
  try {
    await fs.access(filePath);
  } catch {
    await writeJson(filePath, defaultContent);
  }
}

/* init DB files if missing */
(async () => {
  await Promise.all([
    fs.access(BOOKS_DB).catch(() => fs.writeFile(BOOKS_DB, "[]", "utf8")),
    fs.access(TIPS_DB).catch(() => fs.writeFile(TIPS_DB, "[]", "utf8")),
    fs.access(POSTS_DB).catch(() => fs.writeFile(POSTS_DB, "[]", "utf8")),
    ensureFile(USERS_FILE, []),
    ensureFile(SESSIONS_FILE, {}),
  ]);

  // Ensure there is a superadmin user (initial setup)
  const users = await readArray(USERS_FILE);
  if (!users.find(u => u.role === "superadmin")) {
    const pass = ENV_ADMIN_PASS || (await getStoredAdminPass());
    const hash = await bcrypt.hash(pass, 10);
    const superAdmin = { username: DEFAULT_SUPERADMIN_USERNAME, passwordHash: hash, role: "superadmin", createdAt: Date.now() };
    users.push(superAdmin);
    await writeJson(USERS_FILE, users);
    console.log("Superadmin created:", DEFAULT_SUPERADMIN_USERNAME);
  }
})();

/* ===== Authentication helpers ===== */
async function loadSessions() {
  const s = await readJson(SESSIONS_FILE);
  return s && typeof s === "object" ? s : {};
}
async function saveSessions(sessions) {
  await writeJson(SESSIONS_FILE, sessions);
}
async function createSession(username, role) {
  const token = uuidv4();
  const sessions = await loadSessions();
  // store minimal info; you can add expiry if desired
  sessions[token] = { username, role, createdAt: Date.now() };
  await saveSessions(sessions);
  return token;
}
async function getSessionByToken(token) {
  if (!token) return null;
  const sessions = await loadSessions();
  return sessions[token] || null;
}
async function destroySession(token) {
  const sessions = await loadSessions();
  delete sessions[token];
  await saveSessions(sessions);
}

/* verifyAdmin compatibility: either legacy x-admin-pass OR valid session with role admin/superadmin OR body.password (legacy) */
async function verifyAdmin(req) {
  // 1) token-based
  const token = req.headers["x-auth-token"];
  if (token) {
    const sess = await getSessionByToken(token);
    if (sess && (sess.role === "admin" || sess.role === "superadmin")) return true;
  }

  // 2) legacy header
  const provided = req.headers["x-admin-pass"] || (req.body && req.body.password);
  if (provided) {
    const current = await getStoredAdminPass();
    if (provided === current) return true;
  }

  return false;
}

/* middleware: authenticate via token */
async function authenticate(req, res, next) {
  const token = req.headers["x-auth-token"];
  if (!token) return res.status(401).json({ ok: false, message: "مفقود رمز المصادقة (x-auth-token)." });
  const sess = await getSessionByToken(token);
  if (!sess) return res.status(401).json({ ok: false, message: "رمز المصادقة غير صالح." });
  req.user = { username: sess.username, role: sess.role };
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: "غير مصدق." });
    if (req.user.role !== role) return res.status(403).json({ ok: false, message: "ليس لديك الصلاحية المطلوبة." });
    next();
  };
}

/* ===== Users utilities ===== */
async function findUser(username) {
  const users = await readArray(USERS_FILE);
  return users.find(u => u.username === username) || null;
}
async function saveUser(user) {
  const users = await readArray(USERS_FILE);
  const idx = users.findIndex(u => u.username === user.username);
  if (idx === -1) users.push(user);
  else users[idx] = user;
  await writeJson(USERS_FILE, users);
}

/* ===== Public auth endpoints ===== */
/* login: username + password -> token */
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, message: "أرسل اسم المستخدم وكلمة المرور." });

    const user = await findUser(username);
    // fallback: if not found, check legacy superadmin using ADMIN_PASS and default username
    if (!user && username === DEFAULT_SUPERADMIN_USERNAME) {
      const storedPass = await getStoredAdminPass();
      if (password === storedPass) {
        // create user record for superadmin and continue
        const hash = await bcrypt.hash(password, 10);
        const newUser = { username, passwordHash: hash, role: "superadmin", createdAt: Date.now() };
        await saveUser(newUser);
        const token = await createSession(username, "superadmin");
        return res.json({ ok: true, token, role: "superadmin", username });
      }
    }
    if (!user) return res.status(401).json({ ok: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة." });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ ok: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة." });
    const token = await createSession(user.username, user.role);
    res.json({ ok: true, token, role: user.role, username: user.username });
  } catch (err) {
    console.error("POST /auth/login:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* logout */
app.post("/auth/logout", authenticate, async (req, res) => {
  try {
    const token = req.headers["x-auth-token"];
    await destroySession(token);
    res.json({ ok: true, message: "تم تسجيل الخروج." });
  } catch (err) {
    console.error("POST /auth/logout:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* create-admin: only superadmin can create admins */
app.post("/auth/create-admin", authenticate, requireRole("superadmin"), async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, message: "أدخل اسم مستخدم وكلمة مرور." });
    if (await findUser(username)) return res.status(400).json({ ok: false, message: "اسم المستخدم موجود مسبقاً." });
    const allowedRole = role === "superadmin" ? "superadmin" : "admin";
    const hash = await bcrypt.hash(password, 10);
    const newUser = { username, passwordHash: hash, role: allowedRole, createdAt: Date.now() };
    await saveUser(newUser);
    res.json({ ok: true, message: "تم إنشاء المستخدم بنجاح.", data: { username, role: allowedRole } });
  } catch (err) {
    console.error("POST /auth/create-admin:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* get current user info */
app.get("/auth/me", authenticate, (req, res) => {
  res.json({ ok: true, username: req.user.username, role: req.user.role });
});

/* change own password */
app.post("/auth/change-password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ ok: false, message: "أرسل كلمة المرور الحالية والجديدة." });
    const user = await findUser(req.user.username);
    if (!user) return res.status(404).json({ ok: false, message: "المستخدم غير موجود." });
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(403).json({ ok: false, message: "كلمة المرور الحالية غير صحيحة." });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await saveUser(user);
    res.json({ ok: true, message: "تم تغيير كلمة المرور." });
  } catch (err) {
    console.error("POST /auth/change-password (self):", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* change another user's password (superadmin only) */
app.post("/auth/change-password/:username", authenticate, requireRole("superadmin"), async (req, res) => {
  try {
    const target = req.params.username;
    const { newPassword } = req.body || {};
    if (!newPassword) return res.status(400).json({ ok: false, message: "أرسل كلمة مرور جديدة." });
    const user = await findUser(target);
    if (!user) return res.status(404).json({ ok: false, message: "المستخدم الهدف غير موجود." });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await saveUser(user);
    res.json({ ok: true, message: "تم تغيير كلمة مرور المستخدم." });
  } catch (err) {
    console.error("POST /auth/change-password/:username:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* list users (superadmin only) */
app.get("/auth/users", authenticate, requireRole("superadmin"), async (req, res) => {
  try {
    const users = await readArray(USERS_FILE);
    // don't send password hashes
    const out = users.map(u => ({ username: u.username, role: u.role, createdAt: u.createdAt }));
    res.json({ ok: true, data: out });
  } catch (err) {
    console.error("GET /auth/users:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* ===== Books, Tips, Posts =====
   Updated to require token-based admin or legacy behavior.
*/
async function requireAnyAdminMiddleware(req, res, next) {
  // allow token-based admin
  const token = req.headers["x-auth-token"];
  if (token) {
    const sess = await getSessionByToken(token);
    if (sess && (sess.role === "admin" || sess.role === "superadmin")) {
      req.user = { username: sess.username, role: sess.role };
      return next();
    }
  }
  // legacy fallback
  const provided = req.headers["x-admin-pass"] || (req.body && req.body.password);
  if (provided) {
    const current = await getStoredAdminPass();
    if (provided === current) return next();
  }
  return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
}

/* ===== Books endpoints (unchanged behavior, updated auth) ===== */
app.get("/books", async (req, res) => {
  try {
    const books = await readArray(BOOKS_DB);
    res.json({ ok: true, data: books });
  } catch (err) {
    console.error("GET /books:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.post("/books", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const { title, url } = req.body;
    if (!title || !url) return res.status(400).json({ ok: false, message: "الرجاء إدخال الاسم والرابط." });
    const books = await readArray(BOOKS_DB);
    const newBook = { id: uuidv4(), title, url, createdAt: Date.now() };
    books.push(newBook);
    await writeJson(BOOKS_DB, books);
    res.json({ ok: true, message: "تمت إضافة الكتاب بنجاح", data: newBook });
  } catch (err) {
    console.error("POST /books:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.put("/books/:id", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const books = await readArray(BOOKS_DB);
    const idx = books.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "الكتاب غير موجود." });
    books[idx].title = req.body.title || books[idx].title;
    books[idx].url = req.body.url || books[idx].url;
    books[idx].updatedAt = Date.now();
    await writeJson(BOOKS_DB, books);
    res.json({ ok: true, message: "تم تعديل الكتاب", data: books[idx] });
  } catch (err) {
    console.error("PUT /books/:id:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.delete("/books/:id", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const books = await readArray(BOOKS_DB);
    const idx = books.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "الكتاب غير موجود." });
    const removed = books.splice(idx, 1)[0];
    await writeJson(BOOKS_DB, books);
    res.json({ ok: true, message: "تم حذف الكتاب", data: removed });
  } catch (err) {
    console.error("DELETE /books/:id:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* ===== Tips endpoints (same pattern) ===== */
app.get("/tips", async (req, res) => {
  try {
    const tips = await readArray(TIPS_DB);
    res.json({ ok: true, data: tips });
  } catch (err) {
    console.error("GET /tips:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.post("/tips", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const text = req.body.text || "";
    const tips = await readArray(TIPS_DB);
    const newTip = { id: uuidv4(), text, createdAt: Date.now() };
    tips.push(newTip);
    await writeJson(TIPS_DB, tips);
    res.json({ ok: true, message: "تمت إضافة الإرشاد بنجاح", data: newTip });
  } catch (err) {
    console.error("POST /tips:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.put("/tips/:id", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const tips = await readArray(TIPS_DB);
    const idx = tips.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "الإرشاد غير موجود." });
    tips[idx].text = req.body.text || tips[idx].text;
    tips[idx].updatedAt = Date.now();
    await writeJson(TIPS_DB, tips);
    res.json({ ok: true, message: "تم تعديل الإرشاد", data: tips[idx] });
  } catch (err) {
    console.error("PUT /tips/:id:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.delete("/tips/:id", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const tips = await readArray(TIPS_DB);
    const idx = tips.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "الإرشاد غير موجود." });
    const removed = tips.splice(idx, 1)[0];
    await writeJson(TIPS_DB, tips);
    res.json({ ok: true, message: "تم حذف الإرشاد", data: removed });
  } catch (err) {
    console.error("DELETE /tips/:id:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* ===== Posts (unchanged endpoints but use requireAnyAdminMiddleware for protected ops) ===== */
app.get("/posts", async (req, res) => {
  try {
    const posts = await readArray(POSTS_DB);
    res.json({ ok: true, data: posts });
  } catch (err) {
    console.error("GET /posts:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.post("/posts", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const { title, description, videoUrl } = req.body;
    if (!title || !videoUrl) return res.status(400).json({ ok: false, message: "الرجاء إدخال العنوان والرابط للفيديو." });
    const posts = await readArray(POSTS_DB);
    const newPost = { id: uuidv4(), title, description: description || "", videoUrl, createdAt: Date.now() };
    posts.unshift(newPost);
    await writeJson(POSTS_DB, posts);
    res.json({ ok: true, message: "تمت إضافة المشاركة بنجاح", data: newPost });
  } catch (err) {
    console.error("POST /posts:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.put("/posts/:id", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const posts = await readArray(POSTS_DB);
    const idx = posts.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "المشاركة غير موجودة." });
    posts[idx].title = req.body.title || posts[idx].title;
    posts[idx].description = req.body.description || posts[idx].description;
    if (req.body.videoUrl) posts[idx].videoUrl = req.body.videoUrl;
    posts[idx].updatedAt = Date.now();
    await writeJson(POSTS_DB, posts);
    res.json({ ok: true, message: "تم تعديل المشاركة", data: posts[idx] });
  } catch (err) {
    console.error("PUT /posts/:id:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});
app.delete("/posts/:id", requireAnyAdminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const posts = await readArray(POSTS_DB);
    const idx = posts.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "المشاركة غير موجودة." });
    const removed = posts.splice(idx, 1)[0];
    await writeJson(POSTS_DB, posts);
    res.json({ ok: true, message: "تم حذف المشاركة", data: removed });
  } catch (err) {
    console.error("DELETE /posts/:id:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

/* ===== Legacy admin change-password kept for compatibility =====
   It will update admin.json (legacy) and also update superadmin user if exists.
*/
app.post("/admin/change-password", async (req, res) => {
  try {
    // verify legacy method
    const provided = req.headers["x-admin-pass"] || (req.body && req.body.password);
    const current = await getStoredAdminPass();
    if (!provided || provided !== current) return res.status(403).json({ ok: false, message: "كلمة السر الحالية غير صحيحة." });
    const newPass = req.body.newPassword;
    if (!newPass || typeof newPass !== "string" || newPass.length < 4) {
      return res.status(400).json({ ok: false, message: "أدخل كلمة مرور جديدة صحيحة (طول ≥4)." });
    }
    // update legacy admin.json
    await writeJson(ADMIN_FILE, { password: newPass, updatedAt: Date.now() });
    // also update superadmin user if exists
    const users = await readArray(USERS_FILE);
    const superIdx = users.findIndex(u => u.role === "superadmin");
    if (superIdx !== -1) {
      users[superIdx].passwordHash = await bcrypt.hash(newPass, 10);
      await writeJson(USERS_FILE, users);
    }
    res.json({ ok: true, message: "تم تغيير كلمة المرور بنجاح." });
  } catch (err) {
    console.error("POST /admin/change-password:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.get("/", (req, res) => res.send("✅ السيرفر يعمل – موقع الشيخ موسى أحمد الخلايلة"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));
