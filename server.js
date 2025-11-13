const express = require("express");
const multer = require("multer");
const fs = require("fs");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
app.use(cors());
app.use(express.json());

/* إعداد Cloudinary */
cloudinary.config({
  cloud_name: "dkdnq0zj3",
  api_key: "199116839454328",
  api_secret: "wIMx8MXvHjbElAgXoe2XTDvnzuI",
});

/* التخزين على Cloudinary */
const storageBooks = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "mosa-books",
    resource_type: "raw",
  },
});
const storageTips = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "mosa-tips",
    resource_type: "raw",
  },
});

const uploadBook = multer({ storage: storageBooks });
const uploadTipFile = multer({ storage: storageTips });

const BOOKS_DB = "./books.json";
const TIPS_DB = "./tips.json";
if (!fs.existsSync(BOOKS_DB)) fs.writeFileSync(BOOKS_DB, "[]");
if (!fs.existsSync(TIPS_DB)) fs.writeFileSync(TIPS_DB, "[]");

const ADMIN_PASS = "sayaf1820";

/* ========== الكتب ========== */
app.get("/books", (req, res) => {
  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  res.json(books);
});

app.post("/uploadBook", uploadBook.single("pdf"), (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });

  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  const newBook = { title: req.body.title, url: req.file.path };
  books.push(newBook);
  fs.writeFileSync(BOOKS_DB, JSON.stringify(books, null, 2));
  res.json({ message: "✅ تم رفع الكتاب بنجاح!", link: req.file.path });
});

/* تعديل كتاب */
app.put("/editBook/:index", (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });

  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  const i = parseInt(req.params.index);
  if (i < 0 || i >= books.length)
    return res.status(404).json({ message: "الكتاب غير موجود." });

  books[i].title = req.body.title || books[i].title;
  fs.writeFileSync(BOOKS_DB, JSON.stringify(books, null, 2));
  res.json({ message: "✅ تم تعديل اسم الكتاب بنجاح!" });
});

/* حذف كتاب */
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

app.post("/uploadTip", uploadTipFile.single("pdf"), (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });

  const tips = JSON.parse(fs.readFileSync(TIPS_DB));
  const newTip = {
    title: req.body.title,
    text: req.body.text || "",
    url: req.file ? req.file.path : null,
  };
  tips.push(newTip);
  fs.writeFileSync(TIPS_DB, JSON.stringify(tips, null, 2));
  res.json({ message: "✅ تم رفع الإرشاد بنجاح!" });
});

/* تعديل وحذف الإرشادات */
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

app.get("/", (req, res) => res.send("✅ السيرفر متصل بـ Cloudinary ويعمل"));
app.listen(4000, () => console.log("🚀 السيرفر يعمل على http://localhost:4000"));


