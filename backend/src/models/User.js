import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true, index: true },
  passwordHash: { type: String, required: true },
  chatNumber: { type: String, unique: true, index: true },
  avatarUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});

export default mongoose.model('User', UserSchema);
