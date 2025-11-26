require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet"); // حماية إضافية للهيدرز
const https = require("https");

const app = express();

// --- الإعدادات والوسائط (Middleware) ---
app.use(cors());
app.use(helmet()); // تحسين الأمان
app.use(express.json());

// --- الاتصال بقاعدة البيانات MongoDB ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح"))
  .catch((err) => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err));

// --- تعريف الجداول (Schemas & Models) ---

// جدول الكتب
const BookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url: { type: String, required: true },
}, { timestamps: true }); // يضيف createdAt و updatedAt تلقائياً

const Book = mongoose.model("Book", BookSchema);

// جدول الإرشادات
const TipSchema = new mongoose.Schema({
  text: { type: String, required: true },
}, { timestamps: true });

const Tip = mongoose.model("Tip", TipSchema);

// جدول المشاركات
const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  videoUrl: String,
}, { timestamps: true });

const Post = mongoose.model("Post", PostSchema);

// --- التحقق من المشرف ---
const verifyAdmin = (req, res, next) => {
  const providedPass = req.headers["x-admin-pass"] || req.body.password;
  const adminPass = process.env.ADMIN_PASS || "sayaf1820";

  if (providedPass === adminPass) {
    next();
  } else {
    res.status(403).json({ ok: false, message: "غير مصرح: كلمة المرور خاطئة" });
  }
};

// --- المسارات (Routes) ---

// 1. يوتيوب بروكسي (كما هو)
app.get("/youtube-feed", (req, res) => {
  const channelId = req.query.channelId;
  if (!channelId) return res.status(400).json({ ok: false, message: "missing channelId" });
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;

  https.get(rssUrl, (resp) => {
    let data = "";
    resp.on("data", chunk => data += chunk);
    resp.on("end", () => {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.send(data);
    });
  }).on("error", (err) => {
    res.status(502).json({ ok: false, message: "فشل جلب الخلاصة من يوتيوب" });
  });
});

// 2. مسارات الكتب (Books)
app.get("/books", async (req, res) => {
  try {
    const books = await Book.find().sort({ createdAt: -1 }); // الأحدث أولاً
    res.json({ ok: true, data: books });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.post("/books", verifyAdmin, async (req, res) => {
  try {
    const { title, url } = req.body;
    if (!title || !url) return res.status(400).json({ ok: false, message: "البيانات ناقصة" });
    
    const newBook = await Book.create({ title, url });
    res.json({ ok: true, message: "تمت إضافة الكتاب", data: newBook });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.delete("/books/:id", verifyAdmin, async (req, res) => {
  try {
    const deleted = await Book.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, message: "الكتاب غير موجود" });
    res.json({ ok: true, message: "تم حذف الكتاب" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "خطأ في المعرف أو الخادم" });
  }
});

// 3. مسارات الإرشادات (Tips)
app.get("/tips", async (req, res) => {
  try {
    const tips = await Tip.find().sort({ createdAt: -1 });
    res.json({ ok: true, data: tips });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.post("/tips", verifyAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ ok: false, message: "النص مطلوب" });
    
    const newTip = await Tip.create({ text });
    res.json({ ok: true, message: "تمت الإضافة", data: newTip });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.put("/tips/:id", verifyAdmin, async (req, res) => {
  try {
    const updated = await Tip.findByIdAndUpdate(req.params.id, { text: req.body.text }, { new: true });
    if (!updated) return res.status(404).json({ ok: false, message: "غير موجود" });
    res.json({ ok: true, message: "تم التعديل", data: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.delete("/tips/:id", verifyAdmin, async (req, res) => {
  try {
    await Tip.findByIdAndDelete(req.params.id);
    res.json({ ok: true, message: "تم الحذف" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// 4. مسارات المشاركات (Posts)
app.get("/posts", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json({ ok: true, data: posts });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.post("/posts", verifyAdmin, async (req, res) => {
  try {
    const { title, description, videoUrl } = req.body;
    const newPost = await Post.create({ title, description, videoUrl });
    res.json({ ok: true, message: "تم النشر", data: newPost });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.put("/posts/:id", verifyAdmin, async (req, res) => {
  try {
    const updated = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ok: true, message: "تم التعديل", data: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.delete("/posts/:id", verifyAdmin, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ ok: true, message: "تم الحذف" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// المسار الرئيسي
app.get("/", (req, res) => res.send("✅ Server is running safely with MongoDB"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
