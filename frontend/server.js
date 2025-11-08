import express from "express";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { createProxyMiddleware } from "http-proxy-middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5173;
const BACKEND = "http://localhost:3000";

const app = express();
const server = http.createServer(app);

// ✅ WebSocket proxy (declare FIRST)
const socketProxy = createProxyMiddleware({
  target: BACKEND,
  changeOrigin: true,
  ws: true,
  secure: false,
});

// ✅ Proxy socket.io FIRST (before static)
app.use("/socket.io", socketProxy);

// ✅ Proxy API
app.use(
  "/api",
  createProxyMiddleware({
    target: BACKEND,
    changeOrigin: true,
  })
);

// ✅ Proxy uploads
app.use(
  "/uploads",
  createProxyMiddleware({
    target: BACKEND,
    changeOrigin: true,
  })
);

// ✅ WebSocket upgrades
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/socket.io")) {
    socketProxy.upgrade(req, socket, head);
  }
});

// ✅ Serve frontend LAST (important)
app.use(express.static(path.join(__dirname, "public")));

server.listen(PORT, () => {
  console.log(`✅ Frontend running at http://localhost:${PORT}`);
});
