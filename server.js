require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const https = require("https");

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Database Connected"))
  .catch((err) => console.error("❌ DB Error:", err));

// --- الجداول ---
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['super', 'mod'], default: 'mod' }
});
const User = mongoose.model("User", UserSchema);

(async () => {
  try {
    if ((await User.countDocuments()) === 0) {
      await User.create({ username: "sayafbadarin", password: process.env.ADMIN_PASS || "sayaf1820", role: "super" });
      console.log("👑 Admin Created");
    }
  } catch (e) { console.log(e.message); }
})();

const Book = mongoose.model("Book", new mongoose.Schema({ title: String, url: String }, { timestamps: true }));
// تعديل: إضافة الصورة للنصائح
const Tip = mongoose.model("Tip", new mongoose.Schema({ text: String, imageUrl: String }, { timestamps: true }));
const Post = mongoose.model("Post", new mongoose.Schema({ title: String, description: String, videoUrl: String }, { timestamps: true }));
const Config = mongoose.model("Config", new mongoose.Schema({ key: { type: String, unique: true }, value: { type: Boolean, default: false } }));

// --- التحقق ---
const auth = async (req, res, next) => {
  const { "x-username": u, "x-password": p } = req.headers;
  if(!u || !p) return res.status(401).json({ok:false});
  const user = await User.findOne({ username: u, password: p });
  if (!user) return res.status(401).json({ ok: false });
  req.user = user; next();
};
const superAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user.role !== 'super') return res.status(403).json({ ok: false });
    next();
  });
};

// --- المسارات ---
app.post("/auth/login", async (req, res) => {
  const user = await User.findOne({ username: req.body.username, password: req.body.password });
  if (!user) return res.status(401).json({ ok: false, message: "بيانات خطأ" });
  res.json({ ok: true, username: user.username, role: user.role });
});

// Users
app.get("/users", superAuth, async (req, res) => res.json({ ok: true, data: await User.find({}, "username role") }));
app.post("/users", superAuth, async (req, res) => {
  try {
    if(await User.findOne({ username: req.body.username })) return res.status(400).json({ok:false, message:"موجود"});
    await User.create(req.body); res.json({ ok: true });
  } catch(e) { res.status(500).json({ok:false}); }
});
app.put("/users/:id", auth, async (req, res) => {
  try { await User.findByIdAndUpdate(req.params.id, req.body); res.json({ ok: true }); } 
  catch(e) { res.status(500).json({ok:false}); }
});
app.delete("/users/:id", superAuth, async (req, res) => {
  if((await User.findById(req.params.id)).username === req.user.username) return res.status(400).json({ok:false});
  await User.findByIdAndDelete(req.params.id); res.json({ ok: true });
});

// Config
app.get("/config/status", async (req, res) => {
  const c = await Config.findOne({ key: "maintenance_mode" });
  if(!c) await Config.create({key:"maintenance_mode", value:false});
  res.json({ maintenance: c ? c.value : false });
});
app.post("/config/maintenance", superAuth, async (req, res) => {
  await Config.findOneAndUpdate({ key: "maintenance_mode" }, { value: req.body.status }, { upsert: true });
  res.json({ ok: true, message: "تم" });
});

// Content
app.get("/books", async (req, res) => res.json({ ok: true, data: await Book.find().sort({createdAt:-1}) }));
app.post("/books", auth, async (req, res) => res.json({ ok: true, data: await Book.create(req.body) }));
app.put("/books/:id", auth, async (req, res) => { await Book.findByIdAndUpdate(req.params.id, req.body); res.json({ ok: true }); });
app.delete("/books/:id", auth, async (req, res) => { await Book.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

app.get("/tips", async (req, res) => res.json({ ok: true, data: await Tip.find().sort({createdAt:-1}) }));
app.post("/tips", auth, async (req, res) => res.json({ ok: true, data: await Tip.create(req.body) }));
app.put("/tips/:id", auth, async (req, res) => { await Tip.findByIdAndUpdate(req.params.id, req.body); res.json({ ok: true }); });
app.delete("/tips/:id", auth, async (req, res) => { await Tip.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

app.get("/posts", async (req, res) => res.json({ ok: true, data: await Post.find().sort({createdAt:-1}) }));
app.post("/posts", auth, async (req, res) => res.json({ ok: true, data: await Post.create(req.body) }));
app.put("/posts/:id", auth, async (req, res) => { await Post.findByIdAndUpdate(req.params.id, req.body); res.json({ ok: true }); });
app.delete("/posts/:id", auth, async (req, res) => { await Post.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

app.get("/youtube-feed", (req, res) => {
  const cid = req.query.channelId;
  https.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`, (r) => {
    let d = ""; r.on("data", c=>d+=c); r.on("end", ()=> { res.setHeader("Content-Type","application/xml"); res.send(d); });
  }).on("error", ()=>res.status(502).send());
});
app.get("/", (req, res) => res.send("✅ Running!"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 ${PORT}`));
