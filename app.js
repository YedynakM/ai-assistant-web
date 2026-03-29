// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ── Firebase Config  ──────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyA8MGQoMdYf-qka0giN3SwjrieTvTGFf4I",
    authDomain: "ai-assistant-web-e2fcc.firebaseapp.com",
    projectId: "ai-assistant-web-e2fcc",
    storageBucket: "ai-assistant-web-e2fcc.firebasestorage.app",
    messagingSenderId: "900989520815",
    appId: "1:900989520815:web:b01f958a0fcb02067abd5a"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── System prompt — forces Ukrainian responses ────────────────────────────────
const SYSTEM_INSTRUCTION = {
    role: "user",
    content: "SYSTEM: You are a helpful AI assistant. You MUST always respond exclusively in Ukrainian, regardless of the language the user writes in. Never switch to another language."
};

const SYSTEM_ACK = {
    role: "model",
    content: "Зрозумiло. Я завжди вiдповiдатиму виключно украïнською мовою."
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentMessages = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const authBtn = document.getElementById("authBtn");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const messagesContainer = document.getElementById("messagesContainer");
const userGreeting = document.getElementById("userGreeting");
const newChatBtn = document.getElementById("newChatBtn");
const menuBtn = document.getElementById("menuBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const emptyState = document.getElementById("emptyState");

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────
const openSidebar = () => { sidebar.classList.add("open"); overlay.classList.add("visible"); };
const closeSidebar = () => { sidebar.classList.remove("open"); overlay.classList.remove("visible"); };
menuBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
overlay.addEventListener("click", closeSidebar);

// ── Auth ──────────────────────────────────────────────────────────────────────
authBtn.addEventListener("click", () =>
    currentUser ? signOut(auth) : signInWithPopup(auth, new GoogleAuthProvider())
);

onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) {
        authBtn.textContent = "Sign Out";
        userGreeting.textContent = user.displayName || "Workspace";
        messageInput.disabled = false;
        sendBtn.disabled = false;
        if (emptyState) {
            emptyState.querySelector("p").textContent = "Type a message below to begin.";
        }
    } else {
        authBtn.textContent = "Sign In with Google";
        userGreeting.textContent = "AI Assistant";
        messageInput.disabled = true;
        sendBtn.disabled = true;
        messagesContainer.innerHTML = "";
        if (emptyState) messagesContainer.appendChild(emptyState);
        emptyState && (emptyState.querySelector("p").textContent = "Sign in to start a conversation.");
        currentMessages = [];
    }
});

// ── New chat ──────────────────────────────────────────────────────────────────
newChatBtn.addEventListener("click", () => {
    currentMessages = [];
    messagesContainer.innerHTML = "";
    if (emptyState) messagesContainer.appendChild(emptyState);
    closeSidebar();
});

// ── Auto-resize textarea ──────────────────────────────────────────────────────
messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
});

// ── Send on Enter (Shift+Enter = newline) ─────────────────────────────────────
messageInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
});

// ── Send message ──────────────────────────────────────────────────────────────
sendBtn.addEventListener("click", async () => {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    emptyState?.remove();

    appendMessage("user", text);
    currentMessages.push({ role: "user", content: text });
    messageInput.value = "";
    messageInput.style.height = "auto";
    sendBtn.disabled = true;

    const modelEl = appendMessage("model", "");
    modelEl.classList.add("typing");

    try {
        const payload = {
            messages: [SYSTEM_INSTRUCTION, SYSTEM_ACK, ...currentMessages],
            userId: currentUser.uid
        };

        const response = await fetch(
            "https://ai-assistant-backend-6n7s.onrender.com/api/chat",
            {
                method: "POST",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");   // explicit UTF-8
        let fullResponse = "";
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop();                      // keep incomplete chunk

            for (const part of parts) {
                if (!part.startsWith("data: ")) continue;
                const raw = part.slice(6).trim();
                if (raw === "[DONE]") break;
                try {
                    const { text } = JSON.parse(raw);
                    if (text) {
                        fullResponse += text;
                        modelEl.classList.remove("typing");
                        const bubble = modelEl.querySelector(".bubble");
                        bubble.innerHTML = marked.parse(fullResponse);
                    }
                } catch { /* malformed chunk — skip */ }
            }
        }

        // Flush any remaining buffer
        if (buffer.startsWith("data: ")) {
            const raw = buffer.slice(6).trim();
            if (raw && raw !== "[DONE]") {
                try {
                    const { text } = JSON.parse(raw);
                    if (text) {
                        fullResponse += text;
                        modelEl.querySelector(".bubble").innerHTML = marked.parse(fullResponse);
                    }
                } catch { /* skip */ }
            }
        }

        currentMessages.push({ role: "model", content: fullResponse });

        await addDoc(collection(db, `users/${currentUser.uid}/chats`), {
            messages: currentMessages,
            timestamp: new Date()
        });

    } catch {
        console.error("DEBUG ERROR:", error);
        modelEl.classList.remove("typing");
        modelEl.querySelector(".bubble").textContent = "Network or server error. Please try again.";
    } finally {
        sendBtn.disabled = false;
        messageInput.focus();
    }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function appendMessage(role, text) {
    const wrapper = document.createElement("div");
    wrapper.className = `message ${role}`;

    const label = document.createElement("div");
    label.className = "msg-label";
    label.textContent = role === "user" ? "You" : "AI Assistant";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = text ? marked.parse(text) : "";

    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return wrapper;
}