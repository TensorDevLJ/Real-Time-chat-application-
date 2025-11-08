import { saveToken, getToken, clearToken } from "./auth.js";
import { register, login, me, searchUsers, uploadFile, uploadAvatar } from "./api.js";

let socket = null;
let currentUser = null;
let activePeer = null;
let replyTo = null;

const $ = s => document.querySelector(s);

function showAuth() {
  document.getElementById("auth").classList.remove("hidden");
  document.getElementById("chat").classList.add("hidden");
}

function showChat() {
  document.getElementById("auth").classList.add("hidden");
  document.getElementById("chat").classList.remove("hidden");
}

function setPresenceDot(el, online) {
  el.className = "dot " + (online ? "online" : "offline");
}

async function init() {
  // SIGNUP
  document.getElementById("btn-signup").onclick = async () => {
    try {
      const { token, user } = await register(
        document.getElementById("su-name").value.trim(),
        document.getElementById("su-pass").value
      );
      saveToken(token);
      await afterLogin(user);
    } catch (e) {
      alert(e.message);
    }
  };

  // LOGIN
  document.getElementById("btn-login").onclick = async () => {
    try {
      const { token, user } = await login(
        document.getElementById("li-name").value.trim(),
        document.getElementById("li-pass").value
      );
      saveToken(token);
      await afterLogin(user);
    } catch (e) {
      alert(e.message);
    }
  };

  // LOGOUT
  document.getElementById("btn-logout").onclick = () => {
    clearToken();
    socket && socket.disconnect();
    location.reload();
  };

  // SEARCH USERS
  document.getElementById("search").oninput = async e => {
    const q = e.target.value.trim();
    if (!q) {
      document.getElementById("results").innerHTML = "";
      return;
    }
    const list = await searchUsers(q);

    document.getElementById("results").innerHTML = list
      .map(
        u => `
        <div class="item" data-id="${u.id}" data-name="${u.name}" data-number="${u.chatNumber}" data-avatar="${u.avatarUrl || ""}">
          <span id="dot-${u.id}" class="dot offline"></span>
          <img class="avatar" src="${u.avatarUrl || ""}" onerror="this.style.display='none'" />
          <div>
            <div><strong>${u.name}</strong></div>
            <div class="muted">${u.chatNumber}</div>
          </div>
        </div>`
      )
      .join("");

    document.querySelectorAll("#results .item").forEach(el =>
      el.onclick = () =>
        openDM({
          id: el.dataset.id,
          name: el.dataset.name,
          chatNumber: el.dataset.number,
          avatarUrl: el.dataset.avatar
        })
    );
  };

  document.getElementById("btn-send").onclick = sendText;

  document.getElementById("text").addEventListener("keydown", e => {
    if (e.key === "Enter") sendText();
    else emitTyping(true);
  });

  document.getElementById("text").addEventListener("keyup", () =>
    setTimeout(() => emitTyping(false), 500)
  );

  document.getElementById("file").onchange = async e => {
    if (!activePeer) return;
    const f = e.target.files[0];
    if (!f) return;

    try {
      const meta = await uploadFile(f);
      socket.emit("send-message", {
        toUserId: activePeer.id,
        attachment: meta,
        replyTo
      });
      replyTo = null;
      document.getElementById("text").placeholder = "Type a message...";
    } catch (err) {
      alert(err.message);
    }
    document.getElementById("file").value = "";
  };

  document.getElementById("avatar-file").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;

    try {
      const { avatarUrl } = await uploadAvatar(f);
      document.getElementById("me-avatar").src = avatarUrl;
    } catch (err) {
      alert(err.message);
    }
    document.getElementById("avatar-file").value = "";
  };

  if (getToken()) {
    try {
      const u = await me();
      await afterLogin(u);
    } catch {
      showAuth();
    }
  } else {
    showAuth();
  }
}

async function afterLogin(user) {
  currentUser = user;
  document.getElementById("me-name").textContent = user.name;
  document.getElementById("me-number").textContent = "Number: " + user.chatNumber;
  document.getElementById("me-avatar").src = user.avatarUrl || "";
  showChat();

  socket = io("http://localhost:3000", {
    auth: { token: getToken() }
  });

  // SOCKET EVENTS
  socket.on("presence", ({ userId, online }) => {
    const dot = document.getElementById("dot-" + userId);
    if (dot) setPresenceDot(dot, online);
  });

  socket.on("typing", ({ from, typing }) => {
    if (activePeer && from === activePeer.id)
      document.getElementById("peer-typing").textContent = typing
        ? activePeer.name + " is typing…"
        : "";
  });

  socket.on("new-message", m => {
    if (activePeer && (m.from === activePeer.id || m.to === activePeer.id)) {
      addMessage(m);
      scrollBottom();
    }
  });

  socket.on("messages", ({ items }) => {
    document.getElementById("messages").innerHTML = "";
    for (const m of items) addMessage(m);
    scrollBottom();
  });

  socket.on("read-receipt", ({ userId }) => {
    if (activePeer && userId === activePeer.id) {
      const last = [...document.querySelectorAll(".msg.me .meta .reads")].pop();
      if (last) last.textContent = "✓✓";
    }
  });

  socket.on("message-updated", m => {
    const el = document.getElementById("msg-" + m.id);
    if (!el) return;
    renderMessageInto(el, m);
  });

  // CALL EVENTS
  socket.on("incoming-call", ({ fromUserId, offer }) =>
    window.handleIncomingCall(fromUserId, offer)
  );
  socket.on("call-answered", ({ fromUserId, answer }) =>
    window.handleCallAnswered(fromUserId, answer)
  );
  socket.on("ice-candidate", ({ fromUserId, candidate }) =>
    window.handleRemoteIce(fromUserId, candidate)
  );
  socket.on("call-ended", ({ fromUserId }) => window.handleCallEnded(fromUserId));
}

async function openDM(peer) {
  activePeer = peer;

  document.getElementById("peer").innerHTML = `
    <div style="display:flex;gap:8px;align-items:center">
      <span id="dot-${peer.id}" class="dot offline"></span>
      <img class="avatar" src="${peer.avatarUrl || ""}" onerror="this.style.display='none'">
      <div>
        <div><strong>${peer.name}</strong></div>
        <div class="muted">${peer.chatNumber}</div>
      </div>
    </div>
  `;

  document.getElementById("peer-name").textContent = peer.name;

  socket.emit("join-dm", { withUserId: peer.id });
  socket.emit("fetch-messages", { withUserId: peer.id, limit: 100 });
  socket.emit("mark-read", { withUserId: peer.id });
}

function addMessage(m) {
  const el = document.createElement("div");
  el.id = "msg-" + m.id;
  el.className = "msg " + (m.from === currentUser.id ? "me" : "");
  renderMessageInto(el, m);
  document.getElementById("messages").appendChild(el);
}

function renderMessageInto(el, m) {
  const mine = m.from === currentUser.id;
  const time = new Date(m.createdAt).toLocaleTimeString();

  let body = "";

  if (m.deletedAt) {
    body += `<div class="muted"><em>message deleted</em></div>`;
  } else {
    if (m.replyTo) body += `<div class="reply">↪ Reply to ${m.replyTo}</div>`;
    if (m.text) body += `<div>${escapeHtml(m.text)}</div>`;
    if (m.attachment) {
      const isVideo = (m.attachment.mimetype || "").startsWith("video");
      body += `<div class="attachment">${
        isVideo
          ? `<video controls src="${m.attachment.url}"></video>`
          : `<img src="${m.attachment.url}" />`
      }</div>`;
    }
  }

  const reactions = (m.reactions || [])
    .map(
      r =>
        `<span class="reaction" data-emoji="${r.emoji}">${r.emoji}</span>`
    )
    .join(" ");

  const actions =
    mine && !m.deletedAt
      ? `
        <div class="msg-actions">
          <button class="btn small" data-edit="${m.id}">Edit</button>
          <button class="btn small danger" data-del="${m.id}">Delete</button>
        </div>`
      : "";

  el.innerHTML = `
    ${body}
    <div class="reactions">${reactions}</div>
    <div class="meta">
      <span>${time}</span>
      <span class="reads">${mine ? "✓" : ""}</span>
      <button class="btn small" data-reply="${m.id}">Reply</button>
      <button class="btn small" data-react="${m.id}">React</button>
    </div>
    ${actions}
  `;

  el.querySelectorAll("[data-react]").forEach(b =>
    b.onclick = () => toggleReaction(m.id, b.getAttribute("data-react"))
  );

  el.querySelectorAll(".reaction").forEach(r =>
    r.onclick = () =>
      toggleReaction(m.id, r.getAttribute("data-emoji"))
  );

  el.querySelectorAll("[data-reply]").forEach(b => {
    b.onclick = () => {
      replyTo = m.id;
      document.getElementById("text").focus();
      document.getElementById("text").placeholder =
        "Replying to " + m.id + "…";
    };
  });

  el.querySelectorAll("[data-edit]").forEach(b => {
    b.onclick = () => editPrompt(m);
  });

  el.querySelectorAll("[data-del]").forEach(b => {
    b.onclick = () => socket.emit("delete-message", { id: m.id });
  });
}

function reactPrompt(id) {
  const emoji = prompt("React with emoji (e.g., 👍 ❤️ 😂 🤯 🔥)");
  if (!emoji) return;
  toggleReaction(id, emoji);
}

function toggleReaction(id, emoji) {
  socket.emit("react-message", { id, emoji });
}

function editPrompt(m) {
  const txt = prompt("Edit your message:", m.text || "");
  if (txt === null) return;
  socket.emit("edit-message", { id: m.id, newText: txt });
}

function scrollBottom() {
  const el = document.getElementById("messages");
  el.scrollTop = el.scrollHeight;
}

function sendText() {
  if (!activePeer) return;
  const text = document.getElementById("text").value.trim();
  if (!text) return;

  socket.emit("send-message", {
    toUserId: activePeer.id,
    text,
    replyTo
  });

  document.getElementById("text").value = "";
  replyTo = null;
  document.getElementById("text").placeholder = "Type a message...";
  emitTyping(false);
}

let typingTimer = null;

function emitTyping(state) {
  if (!activePeer) return;
  clearTimeout(typingTimer);

  socket.emit("typing", { toUserId: activePeer.id, typing: state });

  if (state)
    typingTimer = setTimeout(
      () => socket.emit("typing", { toUserId: activePeer.id, typing: false }),
      1500
    );
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m];
  });
}

window.addEventListener("load", init);
