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
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp
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
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentMessages = [];
let activeHistoryId = null;   // Firestore doc id currently shown

// ── DOM Refs ──────────────────────────────────────────────────────────────────
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
const themeSelect = document.getElementById("themeSelect");
const chatHistoryEl = document.getElementById("chatHistory");

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 1 — THEME SWITCHER
// ════════════════════════════════════════════════════════════════════════════

const THEME_KEY = "ai_assistant_theme";

/** Apply a theme by setting data-theme on <body> and persisting to localStorage */
function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    themeSelect.value = theme;
}

/** Load saved theme on page start (defaults to "light") */
function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(saved);
}

themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

// Run immediately
initTheme();

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 2 — CHAT HISTORY VIA FIRESTORE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Save a completed conversation to Firestore.
 * Called after the SSE stream finishes and fullResponse is known.
 *
 * @param {string} userId
 * @param {string} userPrompt     — the user's last message
 * @param {string} aiResponse     — the full accumulated AI response
 * @param {Array}  messages       — the full messages array at save time
 * @returns {string|null}         — the new Firestore document ID, or null on error
 */
async function saveChat(userId, userPrompt, aiResponse, messages) {
    try {
        const ref = await addDoc(collection(db, "chats"), {
            userId,
            title: userPrompt.slice(0, 60),   // first 60 chars as sidebar title
            userPrompt,
            aiResponse,
            messages,                              // full history for replay
            timestamp: serverTimestamp()
        });
        return ref.id;
    } catch (err) {
        console.error("saveChat error:", err);
        return null;
    }
}

/**
 * Fetch all chats for a user ordered newest-first.
 * Populates the sidebar history list.
 *
 * @param {string} userId
 */
async function loadHistory(userId) {
    // Show spinner while loading
    chatHistoryEl.innerHTML = `
    <div class="history-loading">
      <div class="spinner"></div>
      <span>Loading history…</span>
    </div>`;

    try {
        const q = query(
            collection(db, "chats"),
            where("userId", "==", userId),
            orderBy("timestamp", "desc")
        );

        const snapshot = await getDocs(q);

        chatHistoryEl.innerHTML = "";   // clear spinner

        if (snapshot.empty) {
            chatHistoryEl.innerHTML = `<p class="history-section-label">No previous chats</p>`;
            return;
        }

        chatHistoryEl.innerHTML = `<p class="history-section-label">Recent chats</p>`;

        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement("div");
            item.className = "history-item";
            item.dataset.id = doc.id;
            item.textContent = data.title || "Chat";
            item.title = data.title || "Chat";

            item.addEventListener("click", () => loadChatFromHistory(doc.id, data, item));
            chatHistoryEl.appendChild(item);
        });

    } catch (err) {
        console.error("loadHistory error:", err);
        chatHistoryEl.innerHTML = `<p class="history-section-label">Could not load history</p>`;
    }
}

/**
 * Replay a past conversation into the messages container.
 *
 * @param {string} docId   — Firestore document ID
 * @param {object} data    — document data
 * @param {Element} itemEl — sidebar item element (for active highlight)
 */
function loadChatFromHistory(docId, data, itemEl) {
    // Highlight active item
    document.querySelectorAll(".history-item").forEach(el => el.classList.remove("active"));
    itemEl.classList.add("active");

    activeHistoryId = docId;
    currentMessages = data.messages || [];

    // Clear and re-render
    messagesContainer.innerHTML = "";
    currentMessages.forEach(msg => appendMessage(msg.role, msg.content));

    closeSidebar();
}

// ════════════════════════════════════════════════════════════════════════════
// SIDEBAR TOGGLE
// ════════════════════════════════════════════════════════════════════════════

const openSidebar = () => { sidebar.classList.add("open"); overlay.classList.add("visible"); };
const closeSidebar = () => { sidebar.classList.remove("open"); overlay.classList.remove("visible"); };

menuBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
overlay.addEventListener("click", closeSidebar);

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════

authBtn.addEventListener("click", () =>
    currentUser ? signOut(auth) : signInWithPopup(auth, new GoogleAuthProvider())
);

onAuthStateChanged(auth, async user => {
    currentUser = user;

    if (user) {
        authBtn.textContent = "Sign Out";
        userGreeting.textContent = user.displayName || "Workspace";
        messageInput.disabled = false;
        sendBtn.disabled = false;
        emptyState?.querySelector("p") &&
            (emptyState.querySelector("p").textContent = "Type a message below to begin.");

        // Load history immediately after sign-in
        await loadHistory(user.uid);

    } else {
        authBtn.textContent = "Sign In with Google";
        userGreeting.textContent = "AI Assistant";
        messageInput.disabled = true;
        sendBtn.disabled = true;
        currentMessages = [];
        activeHistoryId = null;
        chatHistoryEl.innerHTML = "";
        messagesContainer.innerHTML = "";
        if (emptyState) {
            messagesContainer.appendChild(emptyState);
            emptyState.querySelector("p").textContent = "Sign in to start a conversation.";
        }
    }
});

// ════════════════════════════════════════════════════════════════════════════
// NEW CHAT
// ════════════════════════════════════════════════════════════════════════════

newChatBtn.addEventListener("click", () => {
    currentMessages = [];
    activeHistoryId = null;
    messagesContainer.innerHTML = "";
    if (emptyState) messagesContainer.appendChild(emptyState);
    document.querySelectorAll(".history-item").forEach(el => el.classList.remove("active"));
    closeSidebar();
});

// ════════════════════════════════════════════════════════════════════════════
// INPUT HELPERS
// ════════════════════════════════════════════════════════════════════════════

messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
});

messageInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
});

// ════════════════════════════════════════════════════════════════════════════
// SEND MESSAGE
// ════════════════════════════════════════════════════════════════════════════

sendBtn.addEventListener("click", async () => {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    emptyState?.remove();

    appendMessage("user", text);
    currentMessages.push({ role: "user", content: text });
    const userPrompt = text;
    messageInput.value = "";
    messageInput.style.height = "auto";
    sendBtn.disabled = true;

    const modelEl = appendMessage("model", "");
    modelEl.classList.add("typing");

    try {
        const response = await fetch(
            "https://ai-assistant-backend-6n7s.onrender.com/api/chat",
            {
                method: "POST",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify({ messages: currentMessages, userId: currentUser.uid })
            }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullResponse = "";
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop();   // keep incomplete tail

            for (const part of parts) {
                if (!part.startsWith("data: ")) continue;
                const raw = part.slice(6).trim();
                if (raw === "[DONE]") break;
                try {
                    const { text, error } = JSON.parse(raw);
                    if (error) {
                        modelEl.classList.remove("typing");
                        modelEl.querySelector(".bubble").textContent = error;
                        return;
                    }
                    if (text) {
                        fullResponse += text;
                        modelEl.classList.remove("typing");
                        modelEl.querySelector(".bubble").innerHTML = marked.parse(fullResponse);
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                } catch { /* malformed chunk — skip */ }
            }
        }

        // Flush remaining buffer tail
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

        // Push AI reply into message history
        currentMessages.push({ role: "model", content: fullResponse });

        // ── Save to Firestore and refresh sidebar ────────────────────────────
        const newDocId = await saveChat(
            currentUser.uid,
            userPrompt,
            fullResponse,
            currentMessages
        );

        if (newDocId) {
            // Prepend new item to the top of the sidebar without a full reload
            const existingLabel = chatHistoryEl.querySelector(".history-section-label");
            if (!existingLabel) {
                chatHistoryEl.innerHTML = `<p class="history-section-label">Recent chats</p>`;
            }

            const item = document.createElement("div");
            item.className = "history-item active";
            item.dataset.id = newDocId;
            item.textContent = userPrompt.slice(0, 60);
            item.title = userPrompt.slice(0, 60);

            // Remove active from any previous item
            document.querySelectorAll(".history-item").forEach(el => el.classList.remove("active"));

            const label = chatHistoryEl.querySelector(".history-section-label");
            chatHistoryEl.insertBefore(item, label ? label.nextSibling : chatHistoryEl.firstChild);

            item.addEventListener("click", () => {
                loadChatFromHistory(newDocId, { messages: currentMessages, title: userPrompt.slice(0, 60) }, item);
            });

            activeHistoryId = newDocId;
        }

    } catch (err) {
        console.error("DEBUG ERROR:", err);
        modelEl.classList.remove("typing");
        modelEl.querySelector(".bubble").textContent = "Network or server error. Please try again.";
    } finally {
        sendBtn.disabled = false;
        messageInput.focus();
    }
});

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

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