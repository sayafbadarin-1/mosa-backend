// server.js (دعم posts + upload to Cloudinary + admin password change)
const express = require("express");
const fs = require("fs").promises;
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const multer = require("multer");
const streamifier = require("streamifier");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = ".";
const BOOKS_DB = path.join(DATA_DIR, "books.json");
const TIPS_DB = path.join(DATA_DIR, "tips.json");
const POSTS_DB = path.join(DATA_DIR, "posts.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");

// Cloudinary configuration from env (optional)
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
} else if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// fallback env pass (إذا لم يُوجد admin.json)
const ENV_ADMIN_PASS = process.env.ADMIN_PASS || "sayaf1820";

// multer in-memory (لرفع الفيديو إلى Cloudinary)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });

// --- helpers لقراءة وكتابة JSON ---
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

// تهيئة ملفات DB إن لم توجد
(async () => {
  await Promise.all([
    fs.access(BOOKS_DB).catch(() => fs.writeFile(BOOKS_DB, "[]", "utf8")),
    fs.access(TIPS_DB).catch(() => fs.writeFile(TIPS_DB, "[]", "utf8")),
    fs.access(POSTS_DB).catch(() => fs.writeFile(POSTS_DB, "[]", "utf8")),
  ]);
  // لا ننشئ admin.json تلقائياً لأن البيئة قد تستخدم ENV_ADMIN_PASS
})();

/* ===== Helpers for array files ===== */
async function readArray(file) {
  const txt = await readJson(file);
  return Array.isArray(txt) ? txt : [];
}

/* ===== Books (same as before) ===== */
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

/* ===== Posts (المشاركات - فيديوهات) ===== */
app.get("/posts", async (req, res) => {
  try {
    const posts = await readArray(POSTS_DB);
    const normalized = posts.map(p => (p.id ? p : { id: uuidv4(), ...p }));
    await writeJson(POSTS_DB, normalized);
    res.json({ ok: true, data: normalized });
  } catch (err) {
    console.error("GET /posts:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

// إنشاء مشاركة (يمكن إرسال videoUrl بدلاً من رفع ملف)
app.post("/posts", async (req, res) => {
  try {
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const { title, description, videoUrl } = req.body;
    if (!title || !videoUrl) return res.status(400).json({ ok: false, message: "الرجاء إدخال عنوان ورابط/فيديو." });
    const posts = await readArray(POSTS_DB);
    const newPost = { id: uuidv4(), title, description: description || "", videoUrl, createdAt: Date.now() };
    posts.unshift(newPost); // أحدث أولاً
    await writeJson(POSTS_DB, posts);
    res.json({ ok: true, message: "تمت إضافة المشاركة", data: newPost });
  } catch (err) {
    console.error("POST /posts:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

app.put("/posts/:id", async (req, res) => {
  try {
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const id = req.params.id;
    const posts = await readArray(POSTS_DB);
    const idx = posts.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "المشاركة غير موجودة." });
    posts[idx].title = req.body.title || posts[idx].title;
    posts[idx].description = (req.body.description !== undefined) ? req.body.description : posts[idx].description;
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
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
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

/* ===== Upload video to Cloudinary (ملف) =====
   POST /uploadVideo
   FormData: file=<video file>
   header: x-admin-pass
   Response: { ok: true, url: "https://..." }
*/
app.post("/uploadVideo", upload.single("file"), async (req, res) => {
  try {
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    if (!req.file) return res.status(400).json({ ok: false, message: "لم يُرفع ملف." });

    if (!cloudinary.config().cloud_name) {
      return res.status(500).json({ ok: false, message: "Cloudinary غير مُكوّن على الخادم. عيّن متغيرات البيئة أولاً." });
    }

    // رفع كـ video عبر upload_stream
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "video", folder: "site_posts" },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return res.status(500).json({ ok: false, message: "فشل رفع الفيديو إلى Cloudinary." });
        }
        res.json({ ok: true, url: result.secure_url, raw: result });
      }
    );
    streamifier.createReadStream(req.file.buffer).pipe(stream);
  } catch (err) {
    console.error("POST /uploadVideo:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم أثناء الرفع." });
  }
});

/* ===== Admin: تغيير كلمة المرور =====
   POST /admin/change-password
   header x-admin-pass: currentPassword
   body: { newPassword: "..." }
*/
app.post("/admin/change-password", async (req, res) => {
  try {
    if (!(await verifyAdmin(req))) return res.status(403).json({ ok: false, message: "كلمة السر الحالية غير صحيحة." });
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

app.get("/", (req, res) => res.send("✅ السيرفر يعمل – موقع الشيخ موسى أحمد الخلايلة"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));
