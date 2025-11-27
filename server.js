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
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['super', 'mod'], default: 'mod' }
});
const User = mongoose.model("User", UserSchema);

// إنشاء المشرف الرئيسي
(async () => {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({ 
        username: "sayafbadarin", 
        password: process.env.ADMIN_PASS || "sayaf1820", 
        role: "super" 
      });
      console.log("👑 Admin Created");
    }
  } catch (e) { console.log(e.message); }
})();

const Book = mongoose.model("Book", new mongoose.Schema({ title: String, url: String }, { timestamps: true }));
const Tip = mongoose.model("Tip", new mongoose.Schema({ text: String }, { timestamps: true }));
const Post = mongoose.model("Post", new mongoose.Schema({ title: String, description: String, videoUrl: String }, { timestamps: true }));
const Config = mongoose.model("Config", new mongoose.Schema({ key: { type: String, unique: true }, value: { type: Boolean, default: false } }));

// --- 3. التحقق (Auth) ---
const auth = async (req, res, next) => {
  const username = req.headers["x-username"];
  const password = req.headers["x-password"];
  if(!username || !password) return res.status(401).json({ok:false, message:"سجل دخولك"});
  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ ok: false, message: "بيانات خطأ" });
  req.user = user;
  next();
};

const superAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user.role !== 'super') return res.status(403).json({ ok: false, message: "صلاحيات رئيسي فقط" });
    next();
  });
};

// --- 4. المسارات (Routes) ---

// دخول
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ ok: false, message: "خطأ في البيانات" });
  res.json({ ok: true, username: user.username, role: user.role });
});

// مشرفين
app.get("/users", superAuth, async (req, res) => res.json({ ok: true, data: await User.find({}, "username role") }));
app.post("/users", superAuth, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if(await User.findOne({ username })) return res.status(400).json({ok:false, message:"موجود مسبقاً"});
    await User.create({ username, password, role });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ok:false}); }
});
app.put("/users/:id", superAuth, async (req, res) => {
  try {
    const { password, role } = req.body;
    const update = {}; if(password) update.password=password; if(role) update.role=role;
    await User.findByIdAndUpdate(req.params.id, update);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ok:false}); }
});
app.delete("/users/:id", superAuth, async (req, res) => {
  const target = await User.findById(req.params.id);
  if(target && target.username === req.user.username) return res.status(400).json({ok:false, message:"لا تحذف نفسك"});
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// صيانة
app.get("/config/status", async (req, res) => {
  try {
    const c = await Config.findOne({ key: "maintenance_mode" });
    if(!c) await Config.create({key:"maintenance_mode", value:false});
    res.json({ maintenance: c ? c.value : false });
  } catch { res.json({ maintenance: false }); }
});
app.post("/config/maintenance", superAuth, async (req, res) => {
  await Config.findOneAndUpdate({ key: "maintenance_mode" }, { value: req.body.status }, { upsert: true });
  res.json({ ok: true, message: "تم تغيير الحالة" });
});

// === المحتوى (تم إضافة PUT للجميع) ===

// كتب
app.get("/books", async (req, res) => res.json({ ok: true, data: await Book.find().sort({createdAt:-1}) }));
app.post("/books", auth, async (req, res) => res.json({ ok: true, data: await Book.create(req.body) }));
app.put("/books/:id", auth, async (req, res) => { await Book.findByIdAndUpdate(req.params.id, req.body); res.json({ ok: true }); });
app.delete("/books/:id", auth, async (req, res) => { await Book.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

// إرشادات
app.get("/tips", async (req, res) => res.json({ ok: true, data: await Tip.find().sort({createdAt:-1}) }));
app.post("/tips", auth, async (req, res) => res.json({ ok: true, data: await Tip.create(req.body) }));
app.put("/tips/:id", auth, async (req, res) => { await Tip.findByIdAndUpdate(req.params.id, req.body); res.json({ ok: true }); });
app.delete("/tips/:id", auth, async (req, res) => { await Tip.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

// مشاركات
app.get("/posts", async (req, res) => res.json({ ok: true, data: await Post.find().sort({createdAt:-1}) }));
app.post("/posts", auth, async (req, res) => res.json({ ok: true, data: await Post.create(req.body) }));
app.put("/posts/:id", auth, async (req, res) => { await Post.findByIdAndUpdate(req.params.id, req.body); res.json({ ok: true }); });
app.delete("/posts/:id", auth, async (req, res) => { await Post.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

// يوتيوب & Uptime
app.get("/youtube-feed", (req, res) => {
  const channelId = req.query.channelId;
  https.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, (resp) => {
    let d = ""; resp.on("data", c=>d+=c); resp.on("end", ()=> { res.setHeader("Content-Type","application/xml"); res.send(d); });
  }).on("error", ()=>res.status(502).send());
});
app.get("/", (req, res) => res.send("✅ Server Running!"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
