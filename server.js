// server.js
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

const ADMIN_PASS = process.env.ADMIN_PASS || "sayaf1820"; // غيّر القيمة في بيئة الاستضافة

// helpers
async function readJson(filePath) {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt || "[]");
  } catch (err) {
    if (err.code === "ENOENT") {
      await fs.writeFile(filePath, "[]");
      return [];
    }
    throw err;
  }
}
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
function checkAuth(req) {
  const pass = req.headers["x-admin-pass"] || (req.body && req.body.password);
  return pass === ADMIN_PASS;
}
function makeId() {
  return uuidv4();
}

// تأكد من وجود ملفات DB عند التشغيل
(async () => {
  await Promise.all([
    fs.access(BOOKS_DB).catch(() => fs.writeFile(BOOKS_DB, "[]")),
    fs.access(TIPS_DB).catch(() => fs.writeFile(TIPS_DB, "[]")),
  ]);
})();

/* ====== Books ====== */
// GET /books
app.get("/books", async (req, res) => {
  try {
    const books = await readJson(BOOKS_DB);
    const normalized = books.map(b => (b.id ? b : { id: makeId(), ...b }));
    await writeJson(BOOKS_DB, normalized);
    res.json({ ok: true, data: normalized });
  } catch (err) {
    console.error("GET /books:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

// POST /books
app.post("/books", async (req, res) => {
  try {
    if (!checkAuth(req)) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const { title, url } = req.body;
    if (!title || !url) return res.status(400).json({ ok: false, message: "الرجاء إدخال الاسم والرابط." });

    const books = await readJson(BOOKS_DB);
    const newBook = { id: makeId(), title, url, createdAt: Date.now() };
    books.push(newBook);
    await writeJson(BOOKS_DB, books);
    res.json({ ok: true, message: "تمت إضافة الكتاب بنجاح", data: newBook });
  } catch (err) {
    console.error("POST /books:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

// PUT /books/:id
app.put("/books/:id", async (req, res) => {
  try {
    if (!checkAuth(req)) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const id = req.params.id;
    const books = await readJson(BOOKS_DB);
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

// DELETE /books/:id
app.delete("/books/:id", async (req, res) => {
  try {
    if (!checkAuth(req)) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const id = req.params.id;
    const books = await readJson(BOOKS_DB);
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

/* ====== Tips ====== */
// GET /tips
app.get("/tips", async (req, res) => {
  try {
    const tips = await readJson(TIPS_DB);
    const normalized = tips.map(t => (t.id ? t : { id: makeId(), ...t }));
    await writeJson(TIPS_DB, normalized);
    res.json({ ok: true, data: normalized });
  } catch (err) {
    console.error("GET /tips:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

// POST /tips
app.post("/tips", async (req, res) => {
  try {
    if (!checkAuth(req)) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const text = req.body.text || "";
    const tips = await readJson(TIPS_DB);
    const newTip = { id: makeId(), text, createdAt: Date.now() };
    tips.push(newTip);
    await writeJson(TIPS_DB, tips);
    res.json({ ok: true, message: "تمت إضافة الإرشاد بنجاح", data: newTip });
  } catch (err) {
    console.error("POST /tips:", err);
    res.status(500).json({ ok: false, message: "خطأ في الخادم" });
  }
});

// PUT /tips/:id
app.put("/tips/:id", async (req, res) => {
  try {
    if (!checkAuth(req)) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const id = req.params.id;
    const tips = await readJson(TIPS_DB);
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

// DELETE /tips/:id
app.delete("/tips/:id", async (req, res) => {
  try {
    if (!checkAuth(req)) return res.status(403).json({ ok: false, message: "كلمة السر غير صحيحة." });
    const id = req.params.id;
    const tips = await readJson(TIPS_DB);
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

app.get("/", (req, res) => res.send("✅ السيرفر يعمل – موقع الشيخ موسى الخلايلة"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));
