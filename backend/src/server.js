import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import uploadRoutes from './routes/upload.js';
import Message from './models/Message.js';
import { decryptText, encryptText } from './lib/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
  serveClient: true   // ✅ ADD THIS
});


const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI).then(()=> console.log('Mongo connected')).catch(err=>{
  console.error('Mongo error', err);
  process.exit(1);
});

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);

// Presence tracking
const onlineUsers = new Map(); // userId -> socketId

function roomForUsers(a, b){
  return ['dm', ...[a,b].sort()].join(':');
}

import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

io.use((socket, next)=>{
  const token = socket.handshake.auth?.token;
  if(!token) return next(new Error('no token'));
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    next();
  }catch{
    next(new Error('bad token'));
  }
});

io.on('connection', (socket)=>{
  const user = socket.user;
  onlineUsers.set(user.id, socket.id);
  io.emit('presence', { userId: user.id, online: true });

  socket.on('join-dm', async ({ withUserId })=>{
    socket.join(roomForUsers(user.id, withUserId));
  });

  socket.on('typing', ({ toUserId, typing })=>{
    const room = roomForUsers(user.id, toUserId);
    socket.to(room).emit('typing', { from: user.id, typing: !!typing });
  });

  socket.on('send-message', async ({ toUserId, text, attachment, replyTo })=>{
    const room = roomForUsers(user.id, toUserId);
    const msg = await Message.create({
      room,
      from: user.id,
      to: toUserId,
      textEnc: text ? encryptText(text) : null,
      attachment: attachment || null,
      replyTo: replyTo || null,
      readBy: [user.id]
    });
    const dto = await toClientDTO(msg);
    io.to(room).emit('new-message', dto);
  });

  socket.on('fetch-messages', async ({ withUserId, limit = 50, before })=>{
    const room = roomForUsers(user.id, withUserId);
    const q = { room };
    if (before) q.createdAt = { $lt: new Date(before) };
    const items = await Message.find(q).sort({ createdAt: -1 }).limit(limit);
    const list = [];
    for (const m of items.reverse()) list.push(await toClientDTO(m));
    socket.emit('messages', { room, items: list });
  });

  socket.on('mark-read', async ({ withUserId })=>{
    const room = roomForUsers(user.id, withUserId);
    await Message.updateMany({ room, readBy: { $ne: user.id } }, { $push: { readBy: user.id } });
    socket.to(room).emit('read-receipt', { room, userId: user.id, at: Date.now() });
  });

  socket.on('edit-message', async ({ id, newText })=>{
    const msg = await Message.findById(id);
    if(!msg || msg.from !== user.id) return;
    msg.textEnc = newText ? encryptText(newText) : null;
    msg.editedAt = new Date();
    await msg.save();
    io.to(msg.room).emit('message-updated', await toClientDTO(msg));
  });

  socket.on('delete-message', async ({ id })=>{
    const msg = await Message.findById(id);
    if(!msg || msg.from !== user.id) return;
    msg.deletedAt = new Date();
    await msg.save();
    io.to(msg.room).emit('message-updated', await toClientDTO(msg));
  });

  socket.on('react-message', async ({ id, emoji })=>{
    const msg = await Message.findById(id);
    if(!msg) return;
    // toggle by same user same emoji (add if not exists, else remove one)
    const exists = msg.reactions.find(r => r.emoji === emoji && r.by === user.id);
    if(exists){
      msg.reactions = msg.reactions.filter(r => !(r.emoji === emoji && r.by === user.id));
    }else{
      msg.reactions.push({ emoji, by: user.id });
    }
    await msg.save();
    io.to(msg.room).emit('message-updated', await toClientDTO(msg));
  });

  // WebRTC signaling
  socket.on('call-user', ({ toUserId, offer })=>{
    const toSocket = onlineUsers.get(toUserId);
    if(toSocket) io.to(toSocket).emit('incoming-call', { fromUserId: user.id, offer });
  });
  socket.on('answer-call', ({ toUserId, answer })=>{
    const toSocket = onlineUsers.get(toUserId);
    if(toSocket) io.to(toSocket).emit('call-answered', { fromUserId: user.id, answer });
  });
  socket.on('ice-candidate', ({ toUserId, candidate })=>{
    const toSocket = onlineUsers.get(toUserId);
    if(toSocket) io.to(toSocket).emit('ice-candidate', { fromUserId: user.id, candidate });
  });
  socket.on('end-call', ({ toUserId })=>{
    const toSocket = onlineUsers.get(toUserId);
    if(toSocket) io.to(toSocket).emit('call-ended', { fromUserId: user.id });
  });

  socket.on('disconnect', ()=>{
    onlineUsers.delete(user.id);
    io.emit('presence', { userId: user.id, online: false });
  });
});

async function toClientDTO(m){
  return {
    id: m.id,
    room: m.room,
    from: m.from,
    to: m.to,
    text: m.deletedAt ? '' : (m.textEnc ? tryDecrypt(m.textEnc) : ''),
    attachment: m.attachment || null,
    replyTo: m.replyTo || null,
    reactions: m.reactions || [],
    readBy: m.readBy || [],
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    createdAt: m.createdAt
  };
}
function tryDecrypt(enc){
  try { return decryptText(enc); } catch { return '[decrypt error]'; }
}

httpServer.listen(PORT, ()=>{
  console.log('Backend listening on http://localhost:'+PORT);
});
