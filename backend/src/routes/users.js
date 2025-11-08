import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function auth(req, res, next){
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if(!token) return res.status(401).json({ error: 'Missing token' });
  try{
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  }catch{
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-z0-9_.-]/gi,'_'))
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_MB || '20',10))*1024*1024 }
});

router.get('/me', auth, async (req, res) => {
  const me = await User.findById(req.user.id);
  if(!me) return res.status(404).json({ error: 'Not found' });
  res.json({ id: me.id, name: me.name, chatNumber: me.chatNumber, avatarUrl: me.avatarUrl });
});

router.get('/search', auth, async (req, res) => {
  const q = (req.query.q || '').toString();
  if(!q) return res.json([]);
  const results = await User.find({
    $or: [
      { name: new RegExp(q, 'i') },
      { chatNumber: new RegExp(q, 'i') }
    ]
  }).limit(20);
  res.json(results.map(u => ({ id: u.id, name: u.name, chatNumber: u.chatNumber, avatarUrl: u.avatarUrl })));
});

router.post('/avatar', auth, upload.single('file'), async (req,res)=>{
  const me = await User.findById(req.user.id);
  if(!me) return res.status(404).json({ error: 'Not found' });
  me.avatarUrl = '/uploads/' + req.file.filename;
  await me.save();
  res.json({ avatarUrl: me.avatarUrl });
});

export default router;
