import { getToken } from "./auth.js";

let pc = null;
let localStream = null;
let currentPeerId = null;
let socket = null;

// FIXED ✅ Always connect to backend, not Vite server
function sock() {
  if (!socket) {
    socket = io("http://localhost:3000", {
      auth: { token: getToken() }
    });
  }
  return socket;
}

async function startCall(toUserId) {
  currentPeerId = toUserId;
  await ensurePC();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sock().emit("call-user", { toUserId, offer });
  showModal();
}

export async function handleIncomingCall(fromUserId, offer) {
  currentPeerId = fromUserId;
  await ensurePC();

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  sock().emit("answer-call", { toUserId: fromUserId, answer });
  showModal();
}

export async function handleCallAnswered(fromUserId, answer) {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

export function handleRemoteIce(fromUserId, candidate) {
  pc && pc.addIceCandidate(new RTCIceCandidate(candidate));
}

export function handleCallEnded() {
  endCall();
}

async function ensurePC() {
  if (pc) return pc;

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = e => {
    if (e.candidate && currentPeerId) {
      sock().emit("ice-candidate", {
        toUserId: currentPeerId,
        candidate: e.candidate
      });
    }
  };

  pc.ontrack = e => {
    document.getElementById("remoteVideo").srcObject = e.streams[0];
  };

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
  });

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  document.getElementById("localVideo").srcObject = localStream;

  return pc;
}

function showModal() {
  document.getElementById("call-modal").classList.remove("hidden");
}
function hideModal() {
  document.getElementById("call-modal").classList.add("hidden");
}

function endCall() {
  if (pc) {
    pc.getSenders().forEach(sender => sender.track && sender.track.stop());
    pc.close();
    pc = null;
  }

  localStream = null;

  if (currentPeerId)
    sock().emit("end-call", { toUserId: currentPeerId });

  currentPeerId = null;
  hideModal();
}

window.addEventListener("load", () => {
  document.getElementById("btn-call").onclick = () => {
    const idEl = document.querySelector('#peer [id^="dot-"]');
    if (!idEl) return alert("Select a user first");

    const id = idEl.id.replace("dot-", "");
    startCall(id);
  };

  document.getElementById("end-call").onclick = () => endCall();
});

// Expose handlers
window.handleIncomingCall = handleIncomingCall;
window.handleCallAnswered = handleCallAnswered;
window.handleRemoteIce = handleRemoteIce;
window.handleCallEnded = handleCallEnded;
