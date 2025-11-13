const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

/* ملفات قاعدة البيانات */
const BOOKS_DB = "./books.json";
const TIPS_DB = "./tips.json";
if (!fs.existsSync(BOOKS_DB)) fs.writeFileSync(BOOKS_DB, "[]");
if (!fs.existsSync(TIPS_DB)) fs.writeFileSync(TIPS_DB, "[]");

const ADMIN_PASS = "sayaf1820";

/* ========== الكتب ========== */
// عرض كل الكتب
app.get("/books", (req, res) => {
  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  res.json(books);
});

// إضافة كتاب (كرابط Google Drive)
app.post("/uploadBook", (req, res) => {
  const { password, title, url } = req.body;
  if (password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });
  if (!title || !url)
    return res.status(400).json({ message: "الرجاء إدخال الاسم والرابط." });

  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  const newBook = { title, url };
  books.push(newBook);
  fs.writeFileSync(BOOKS_DB, JSON.stringify(books, null, 2));
  res.json({ message: "✅ تم إضافة الكتاب من Google Drive بنجاح!" });
});

// تعديل كتاب
app.put("/editBook/:index", (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });
  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  const i = parseInt(req.params.index);
  if (i < 0 || i >= books.length)
    return res.status(404).json({ message: "الكتاب غير موجود." });

  books[i].title = req.body.title || books[i].title;
  books[i].url = req.body.url || books[i].url;
  fs.writeFileSync(BOOKS_DB, JSON.stringify(books, null, 2));
  res.json({ message: "✅ تم تعديل بيانات الكتاب بنجاح!" });
});

// حذف كتاب
app.delete("/deleteBook/:index", (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });
  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  const i = parseInt(req.params.index);
  if (i < 0 || i >= books.length)
    return res.status(404).json({ message: "الكتاب غير موجود." });

  books.splice(i, 1);
  fs.writeFileSync(BOOKS_DB, JSON.stringify(books, null, 2));
  res.json({ message: "🗑️ تم حذف الكتاب بنجاح." });
});

/* ========== الإرشادات ========== */
app.get("/tips", (req, res) => {
  const tips = JSON.parse(fs.readFileSync(TIPS_DB));
  res.json(tips);
});

app.post("/uploadTip", (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });
  const tips = JSON.parse(fs.readFileSync(TIPS_DB));
  const newTip = { text: req.body.text || "" };
  tips.push(newTip);
  fs.writeFileSync(TIPS_DB, JSON.stringify(tips, null, 2));
  res.json({ message: "✅ تم إضافة الإرشاد بنجاح!" });
});

app.put("/editTip/:index", (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });
  const tips = JSON.parse(fs.readFileSync(TIPS_DB));
  const i = parseInt(req.params.index);
  if (i < 0 || i >= tips.length)
    return res.status(404).json({ message: "الإرشاد غير موجود." });
  tips[i].text = req.body.text || tips[i].text;
  fs.writeFileSync(TIPS_DB, JSON.stringify(tips, null, 2));
  res.json({ message: "✅ تم تعديل الإرشاد بنجاح!" });
});

app.delete("/deleteTip/:index", (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });
  const tips = JSON.parse(fs.readFileSync(TIPS_DB));
  const i = parseInt(req.params.index);
  if (i < 0 || i >= tips.length)
    return res.status(404).json({ message: "الإرشاد غير موجود." });
  tips.splice(i, 1);
  fs.writeFileSync(TIPS_DB, JSON.stringify(tips, null, 2));
  res.json({ message: "🗑️ تم حذف الإرشاد بنجاح." });
});

app.get("/", (req, res) => res.send("✅ السيرفر يعمل بنظام Google Drive"));
app.listen(4000, () =>
  console.log("🚀 السيرفر يعمل على http://localhost:4000")
);
