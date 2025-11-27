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

// جدول المستخدمين (جديد)
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['super', 'mod'], default: 'mod' }, // super=رئيسي, mod=مشرف
});
const User = mongoose.model("User", UserSchema);

// إنشاء المشرف الرئيسي تلقائياً إذا لم يوجد أي مستخدم
(async () => {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({ 
        username: "sayafbadarin", 
        password: process.env.ADMIN_PASS || "sayaf1820", 
        role: "super" 
      });
      console.log("👑 تم إنشاء حساب المشرف الرئيسي الافتراضي");
    }
  } catch (e) { console.log("Init Error:", e.message); }
})();

// جداول المحتوى
const Book = mongoose.model("Book", new mongoose.Schema({ title: String, url: String }, { timestamps: true }));
const Tip = mongoose.model("Tip", new mongoose.Schema({ text: String }, { timestamps: true }));
const Post = mongoose.model("Post", new mongoose.Schema({ title: String, description: String, videoUrl: String }, { timestamps: true }));
const Config = mongoose.model("Config", new mongoose.Schema({ key: { type: String, unique: true }, value: { type: Boolean, default: false } }));

// --- 3. أدوات التحقق (Middlewares) ---

// أداة: التحقق من هوية المشرف (لأي عملية تعديل)
const auth = async (req, res, next) => {
  const username = req.headers["x-username"];
  const password = req.headers["x-password"];
  
  if(!username || !password) return res.status(401).json({ok:false, message:"سجل دخولك أولاً"});

  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ ok: false, message: "بيانات الدخول خاطئة" });
  
  req.user = user; // نحفظ بياناته لنستخدمها
  next();
};

// أداة: التحقق من المشرف الرئيسي فقط (للصيانة وإدارة المستخدمين)
const superAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user.role !== 'super') {
      return res.status(403).json({ ok: false, message: "صلاحيات مشرف رئيسي فقط" });
    }
    next();
  });
};

// --- 4. المسارات (Routes) ---

// === تسجيل الدخول ===
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ ok: false, message: "اسم المستخدم أو كلمة المرور خطأ" });
  res.json({ ok: true, username: user.username, role: user.role });
});

// === إدارة المستخدمين (للرئيسي فقط) ===
app.get("/users", superAuth, async (req, res) => {
  const users = await User.find({}, "username role createdAt"); // نجلب القائمة
  res.json({ ok: true, data: users });
});

app.post("/users", superAuth, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if(!username || !password) return res.status(400).json({ ok:false, message:"بيانات ناقصة" });
    const exists = await User.findOne({ username });
    if(exists) return res.status(400).json({ ok:false, message:"الاسم مستخدم سابقاً" });
    
    await User.create({ username, password, role });
    res.json({ ok: true, message: "تمت إضافة المشرف" });
  } catch(e) { res.status(500).json({ok:false}); }
});

app.put("/users/:id", superAuth, async (req, res) => {
  try {
    // تحديث كلمة المرور أو الدور
    const { password, role } = req.body;
    const update = {};
    if(password) update.password = password;
    if(role) update.role = role;
    await User.findByIdAndUpdate(req.params.id, update);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ok:false}); }
});

app.delete("/users/:id", superAuth, async (req, res) => {
  try {
    // منع حذف النفس
    const target = await User.findById(req.params.id);
    if(target && target.username === req.user.username) return res.status(400).json({ok:false, message:"لا يمكنك حذف نفسك"});
    
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ok:false}); }
});

// === نظام الصيانة ===
app.get("/config/status", async (req, res) => {
  try {
    const c = await Config.findOne({ key: "maintenance_mode" });
    if(!c) await Config.create({key:"maintenance_mode", value:false});
    res.json({ maintenance: c ? c.value : false });
  } catch { res.json({ maintenance: false }); }
});

app.post("/config/maintenance", superAuth, async (req, res) => {
  const { status } = req.body;
  await Config.findOneAndUpdate({ key: "maintenance_mode" }, { value: status }, { upsert: true });
  res.json({ ok: true, message: status ? "تم تفعيل الصيانة 🛠️" : "تم فتح الموقع ✅" });
});

// === المحتوى (لأي مشرف) ===
app.post("/books", auth, async (req, res) => res.json({ ok: true, data: await Book.create(req.body) }));
app.delete("/books/:id", auth, async (req, res) => { await Book.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

app.post("/tips", auth, async (req, res) => res.json({ ok: true, data: await Tip.create(req.body) }));
app.put("/tips/:id", auth, async (req, res) => { await Tip.findByIdAndUpdate(req.params.id, req.body); res.json({ ok: true }); });
app.delete("/tips/:id", auth, async (req, res) => { await Tip.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

app.post("/posts", auth, async (req, res) => res.json({ ok: true, data: await Post.create(req.body) }));
app.delete("/posts/:id", auth, async (req, res) => { await Post.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

// القراءة (عام)
app.get("/books", async (req, res) => res.json({ ok: true, data: await Book.find().sort({createdAt:-1}) }));
app.get("/tips", async (req, res) => res.json({ ok: true, data: await Tip.find().sort({createdAt:-1}) }));
app.get("/posts", async (req, res) => res.json({ ok: true, data: await Post.find().sort({createdAt:-1}) }));

// يوتيوب
app.get("/youtube-feed", (req, res) => {
  const channelId = req.query.channelId;
  https.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, (resp) => {
    let d = ""; resp.on("data", c=>d+=c); resp.on("end", ()=> { res.setHeader("Content-Type","application/xml"); res.send(d); });
  }).on("error", ()=>res.status(502).send());
});

// Uptime
app.get("/", (req, res) => res.send("✅ Server & Auth System Running!"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
