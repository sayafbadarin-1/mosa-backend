// server.js (محدّث لدعم تغيير كلمة المرور والتحقق الديناميكي)
const express = require("express");
const fs = require("fs").promises;
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = ".";
const BOOKS_DB = path.join(DATA_DIR, "books.json");
const TIPS_DB = path.join(DATA_DIR, "tips.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");

// fallback env pass (إذا لم يُوجد admin.json)
const ENV_ADMIN_PASS = process.env.ADMIN_PASS || "sayaf1820";

// --- helpers لقراءة وكتابة JSON ---
async function readJson(filePath) {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt || "{}");
  } catch (err) {
    if (err.code === "ENOENT") {
      // لا تنشئ هنا، دع المستدعي يقرر
      return null;
    }
    throw err;
  }
}
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

// الحصول على كلمة المشرف الحالية (تقرأ من admin.json إن وُجد، وإلا من env)
async function getStoredAdminPass() {
  try {
    const obj = await readJson(ADMIN_FILE);
    if (obj && obj.password) return obj.password;
  } catch (err) {
    console.error("getStoredAdminPass read error:", err);
  }
  return ENV_ADMIN_PASS;
}

// يتحقق من صلاحية الطلب (يسمح بكل من x-admin-pass header أو body.password)
async function verifyAdmin(req) {
  const provided = req.headers["x-admin-pass"] || (req.body && req.body.password);
  if (!provided) return false;
  const current = await getStoredAdminPass();
  return provided === current;
}

// تهيئة: تأكد من وجود ملفات DB و admin.json افتراضي
(async () => {
  await Promise.all([
    fs.access(BOOKS_DB).catch(() => fs.writeFile(BOOKS_DB, "[]", "utf8")),
    fs.access(TIPS_DB).catch(() => fs.writeFile(TIPS_DB, "[]", "utf8")),
  ]);
  // لا ننشئ admin.json تلقائياً لأن البيئة قد تستخدم ENV_ADMIN_PASS
})();

/* ===== Books ===== */
async function readArray(file) {
  const txt = await readJson(file);
  return Array.isArray(txt) ? txt : [];
}

app.get("/books", async (req, res) => {
  try {
    const books = await readArray(BOOKS_DB);
    const normalized = books.map(b => (b.id ? b : { id: uuidv4(), ...b }));
    await writeJson(BOOKS_DB, normalized);
    res.json({ ok: true, data: normalized });
  } catch (err) {
    console.error("GET /books:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.post("/books", async (req, res) => {
  try {
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

/* ===== Tips ===== */
app.get("/tips", async (req, res) => {
  try {
    const tips = await readArray(TIPS_DB);
    const normalized = tips.map(t => (t.id ? t : { id: uuidv4(), ...t }));
    await writeJson(TIPS_DB, normalized);
    res.json({ ok: true, data: normalized });
  } catch (err) {
    console.error("GET /tips:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.post("/tips", async (req, res) => {
  try {
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

/* ===== Admin: تغيير كلمة المرور =====
   POST /admin/change-password
   body: { newPassword: "..." } 
   header x-admin-pass: currentPassword
   => يخزن newPassword في admin.json (يحل محل admin stored password).
*/
app.post("/admin/change-password", async (req, res) => {
  try {
    // تحقق من كلمة المرور الحالية عن طريق verifyAdmin (تتطلب header أو body.password)
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر الحالية غير صحيحة." });
    const newPass = req.body.newPassword;
    if (!newPass || typeof newPass !== "string" || newPass.length < 4) {
      return res.status(400).json({ ok: false, message: "أدخل كلمة مرور جديدة صحيحة (طول ≥4)." });
    }
    // اكتب admin.json مع كلمة المرور الجديدة (ببساطة نص عادي هنا)
    await writeJson(ADMIN_FILE, { password: newPass, updatedAt: Date.now() });
    res.json({ ok: true, message: "تم تغيير كلمة المرور بنجاح." });
  } catch (err) {
    console.error("POST /admin/change-password:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.get("/", (req, res) => res.send("✅ السيرفر يعمل – موقع الشيخ موسى الخلايلة"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));
