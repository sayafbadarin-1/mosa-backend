require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const https = require("https");

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. الاتصال بقاعدة البيانات ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Database Connected"))
  .catch((err) => console.error("❌ DB Error:", err));

// --- 2. الجداول (Schemas) ---
const Book = mongoose.model("Book", new mongoose.Schema({
  title: String, url: String
}, { timestamps: true }));

const Tip = mongoose.model("Tip", new mongoose.Schema({
  text: String
}, { timestamps: true }));

const Post = mongoose.model("Post", new mongoose.Schema({
  title: String, description: String, videoUrl: String
}, { timestamps: true }));

// جدول الإعدادات (للصيانة)
const Config = mongoose.model("Config", new mongoose.Schema({
  key: { type: String, unique: true },
  value: { type: Boolean, default: false }
}));

// تهيئة إعداد الصيانة
(async () => {
  const exists = await Config.findOne({ key: "maintenance_mode" });
  if (!exists) await Config.create({ key: "maintenance_mode", value: false });
})();

// --- 3. التحقق من المشرف ---
const verifyAdmin = (req, res, next) => {
  if (req.headers["x-admin-pass"] === (process.env.ADMIN_PASS || "sayaf1820")) next();
  else res.status(403).json({ ok: false, message: "غير مصرح" });
};

// --- 4. المسارات (Routes) ---

// نظام الصيانة
app.get("/config/status", async (req, res) => {
  try {
    const c = await Config.findOne({ key: "maintenance_mode" });
    res.json({ maintenance: c ? c.value : false });
  } catch { res.json({ maintenance: false }); }
});

app.post("/config/maintenance", verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await Config.findOneAndUpdate({ key: "maintenance_mode" }, { value: status });
    res.json({ ok: true, message: status ? "تم تفعيل الصيانة 🛠️" : "تم فتح الموقع ✅" });
  } catch (e) { res.status(500).json({ ok: false }); }
});

// يوتيوب
app.get("/youtube-feed", (req, res) => {
  const channelId = req.query.channelId;
  if(!channelId) return res.status(400).send();
  https.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, (resp) => {
    let d = ""; resp.on("data", c=>d+=c); resp.on("end", ()=> {
      res.setHeader("Content-Type", "application/xml"); res.send(d);
    });
  }).on("error", ()=>res.status(502).send());
});

// العمليات الأساسية (CRUD)
app.get("/books", async (req, res) => res.json({ ok: true, data: await Book.find().sort({createdAt:-1}) }));
app.post("/books", verifyAdmin, async (req, res) => res.json({ ok: true, data: await Book.create(req.body) }));
app.delete("/books/:id", verifyAdmin, async (req, res) => { await Book.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

app.get("/tips", async (req, res) => res.json({ ok: true, data: await Tip.find().sort({createdAt:-1}) }));
app.post("/tips", verifyAdmin, async (req, res) => res.json({ ok: true, data: await Tip.create(req.body) }));
app.delete("/tips/:id", verifyAdmin, async (req, res) => { await Tip.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

app.get("/posts", async (req, res) => res.json({ ok: true, data: await Post.find().sort({createdAt:-1}) }));
app.post("/posts", verifyAdmin, async (req, res) => res.json({ ok: true, data: await Post.create(req.body) }));
app.delete("/posts/:id", verifyAdmin, async (req, res) => { await Post.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
// --- إضافة هذا المسار ليعرف UptimeRobot أن السيرفر يعمل ---
app.get("/", (req, res) => res.send("✅ Server is Running!"));

// --- تشغيل السيرفر ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));

