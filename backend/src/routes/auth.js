import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import User from '../models/User.js';
import { generateChatNumber } from '../lib/utils.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const authSchema = Joi.object({
  name: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).max(100).required()
});

router.post('/register', async (req, res) => {
  try {
    const { name, password } = await authSchema.validateAsync(req.body);
    const exists = await User.findOne({ name: new RegExp('^'+name+'$', 'i') });
    if (exists) return res.status(409).json({ error: 'Username already exists' });
    const hash = await bcrypt.hash(password, 10);

    // Ensure unique chat number
    let chatNumber;
    while (true) {
      chatNumber = generateChatNumber();
      const clash = await User.findOne({ chatNumber });
      if (!clash) break;
    }

    const user = await User.create({ name, passwordHash: hash, chatNumber });
    const token = jwt.sign({ id: user.id, name: user.name, chatNumber: user.chatNumber }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, chatNumber: user.chatNumber, avatarUrl: user.avatarUrl } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { name, password } = await authSchema.validateAsync(req.body);
    const user = await User.findOne({ name: new RegExp('^'+name+'$', 'i') });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, name: user.name, chatNumber: user.chatNumber }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, chatNumber: user.chatNumber, avatarUrl: user.avatarUrl } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
