// server.js - نسخة "القديم" المتوافقة مع main.js الأخير (x-admin-pass)
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());
app.use(require("cors")());

// ملفات البيانات في نفس مجلد المشروع
const DATA_DIR = ".";
const BOOKS_DB = path.join(DATA_DIR, "books.json");
const TIPS_DB = path.join(DATA_DIR, "tips.json");
const POSTS_DB = path.join(DATA_DIR, "posts.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");

// كلمة المرور الافتراضية (تُستخدم إذا لم يوجد admin.json)
// افتراضياً: sayaf1820
const ENV_ADMIN_PASS = process.env.ADMIN_PASS || "sayaf1820";

// --- أدوات قراءة/كتابة JSON بسيطة ---
async function readJson(filePath) {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt || "null");
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
async function readArray(filePath) {
  const j = await readJson(filePath);
  return Array.isArray(j) ? j : [];
}

// --- استرجاع كلمة مرور المشرف من ملف admin.json أو ENV ---
async function getStoredAdminPass() {
  try {
    const obj = await readJson(ADMIN_FILE);
    if (obj && typeof obj.password === "string") return obj.password;
  } catch (err) {
    console.error("خطأ قراءة admin.json:", err);
  }
  return ENV_ADMIN_PASS;
}

// --- وظيفة تحقق المشرف ---
// يقبل الهيدر "x-admin-pass" أو وجود password في body (للنداءات القديمة)
async function verifyAdminProvided(req) {
  const provided = req.headers["x-admin-pass"] || (req.body && req.body.password);
  if (!provided) return false;
  const current = await getStoredAdminPass();
  return provided === current;
}

// --- تهيئة ملفات DB إن لم تكن موجودة ---
(async () => {
  await Promise.all([
    fs.access(BOOKS_DB).catch(() => fs.writeFile(BOOKS_DB, "[]", "utf8")),
    fs.access(TIPS_DB).catch(() => fs.writeFile(TIPS_DB, "[]", "utf8")),
    fs.access(POSTS_DB).catch(() => fs.writeFile(POSTS_DB, "[]", "utf8")),
    fs.access(ADMIN_FILE).catch(() => fs.writeFile(ADMIN_FILE, JSON.stringify({ password: ENV_ADMIN_PASS }, null, 2), "utf8")),
  ]);
})();

// ====== مسارات الكتب ======
app.get("/books", async (req, res) => {
  try {
    const books = await readArray(BOOKS_DB);
    res.json({ ok: true, data: books });
  } catch (err) {
    console.error("GET /books error:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.post("/books", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

app.put("/books/:id", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

app.delete("/books/:id", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

// ====== مسارات الإرشادات (tips) ======
app.get("/tips", async (req, res) => {
  try {
    const tips = await readArray(TIPS_DB);
    res.json({ ok: true, data: tips });
  } catch (err) {
    console.error("GET /tips:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.post("/tips", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

app.put("/tips/:id", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

app.delete("/tips/:id", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

// ====== مسارات المشاركات (posts) ======
/*
  Schema: { id, title, description, videoUrl, createdAt, updatedAt? }
*/
app.get("/posts", async (req, res) => {
  try {
    const posts = await readArray(POSTS_DB);
    res.json({ ok: true, data: posts });
  } catch (err) {
    console.error("GET /posts:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.post("/posts", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const { title, description, videoUrl } = req.body;
    if (!title) return res.status(400).json({ ok: false, message: "الرجاء إدخال العنوان." });
    const posts = await readArray(POSTS_DB);
    const newPost = { id: uuidv4(), title, description: description || "", videoUrl: videoUrl || "", createdAt: Date.now() };
    posts.unshift(newPost); // أحدث أولاً
    await writeJson(POSTS_DB, posts);
    res.json({ ok: true, message: "تمت إضافة المشاركة بنجاح", data: newPost });
  } catch (err) {
    console.error("POST /posts:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.put("/posts/:id", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

app.delete("/posts/:id", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

// ====== تغيير كلمة المرور للمشرف (legacy) ======
// يطلب هيدر x-admin-pass: currentPassword
// وجسم يحتوي newPassword
app.post("/admin/change-password", async (req, res) => {
  try {
    if (!(await verifyAdminProvided(req))) return res.status(403).json({ ok: false, message: "كلمة السر الحالية غير صحيحة." });
    const newPass = req.body.newPassword;
    if (!newPass || typeof newPass !== "string" || newPass.length < 4) {
      return res.status(400).json({ ok: false, message: "أدخل كلمة مرور جديدة صحيحة (طول ≥4)." });
    }
    await writeJson(ADMIN_FILE, { password: newPass, updatedAt: Date.now() });
    res.json({ ok: true, message: "تم تغيير كلمة المرور بنجاح." });
  } catch (err) {
    console.error("POST /admin/change-password:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

// basic root
app.get("/", (req, res) => res.send("✅ السيرفر يعمل – موقع الشيخ موسى أحمد الخلايلة"));

// start
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));
