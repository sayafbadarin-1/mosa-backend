const express = require("express");
const multer = require("multer");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/tips_uploads", express.static("tips_uploads"));

// مجلدات الرفع
const storageBooks = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const uploadBook = multer({ storage: storageBooks });

const storageTips = multer.diskStorage({
  destination: "tips_uploads",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const uploadTip = multer({ storage: storageTips });

// ملفات JSON
const BOOKS_DB = "./books.json";
const TIPS_DB = "./tips.json";
if (!fs.existsSync(BOOKS_DB)) fs.writeFileSync(BOOKS_DB, "[]");
if (!fs.existsSync(TIPS_DB)) fs.writeFileSync(TIPS_DB, "[]");

// كلمة السر
const ADMIN_PASS = "sayaf1820";

// ---------- الكتب ----------
app.get("/books", (req, res) => {
  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  res.json(books);
});

app.post("/uploadBook", uploadBook.single("pdf"), (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });

  const books = JSON.parse(fs.readFileSync(BOOKS_DB));
  const newBook = { title: req.body.title, filename: req.file.filename };
  books.push(newBook);
  fs.writeFileSync(BOOKS_DB, JSON.stringify(books, null, 2));
  res.json({ message: "✅ تم رفع الكتاب بنجاح!" });
});

// ---------- الإرشادات ----------
app.get("/tips", (req, res) => {
  const tips = JSON.parse(fs.readFileSync(TIPS_DB));
  res.json(tips);
});

app.post("/uploadTip", uploadTip.single("pdf"), (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ message: "⚠️ كلمة السر غير صحيحة." });

  const tips = JSON.parse(fs.readFileSync(TIPS_DB));
  const newTip = {
    title: req.body.title,
    text: req.body.text || null,
    filename: req.file ? req.file.filename : null
  };
  tips.push(newTip);
  fs.writeFileSync(TIPS_DB, JSON.stringify(tips, null, 2));
  res.json({ message: "✅ تم رفع الإرشاد بنجاح!" });
});

app.get("/", (req, res) => res.send("✅ السيرفر يعمل بنجاح"));
app.listen(4000, () => console.log("🚀 السيرفر يعمل على http://localhost:4000"));