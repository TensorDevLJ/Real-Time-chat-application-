import mongoose from 'mongoose';

const ReactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  by: { type: String, required: true }, // userId
  at: { type: Date, default: Date.now }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  room: { type: String, index: true }, // dm:<a>:<b>
  from: { type: String, required: true }, // userId
  to: { type: String, required: true },   // userId
  textEnc: { // AES-GCM encrypted blob
    iv: String,
    ct: String,
    tag: String
  },
  attachment: {
    url: String,
    original: String,
    size: Number,
    mimetype: String
  },
  replyTo: { type: String, default: null }, // messageId
  reactions: [ReactionSchema],
  readBy: { type: [String], default: [] },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Message', MessageSchema);
