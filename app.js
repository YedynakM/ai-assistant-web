// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA8MGQoMdYf-qka0giN3SwjrieTvTGFf4I",
    authDomain: "ai-assistant-web-e2fcc.firebaseapp.com",
    projectId: "ai-assistant-web-e2fcc",
    storageBucket: "ai-assistant-web-e2fcc.firebasestorage.app",
    messagingSenderId: "900989520815",
    appId: "1:900989520815:web:b01f958a0fcb02067abd5a"
};

const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore();
let currentUser = null, currentMessages = [];
const authBtn = document.getElementById('authBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messagesContainer');
const userGreeting = document.getElementById('userGreeting');

authBtn.addEventListener('click', () =>
    currentUser ? signOut(auth) : signInWithPopup(auth, new GoogleAuthProvider())
);

onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) {
        authBtn.textContent = 'Вийти';
        userGreeting.textContent = `Робочий простір: ${user.displayName}`;
        messageInput.disabled = false;
        sendBtn.disabled = false;
    } else {
        authBtn.textContent = 'Увійти через Google';
        userGreeting.textContent = 'AI Assistant';
        messageInput.disabled = true;
        sendBtn.disabled = true;
        messagesContainer.innerHTML = '';
        currentMessages = [];
    }
});

sendBtn.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;
    appendMessage('user', text);
    currentMessages.push({ role: 'user', content: text });
    messageInput.value = '';
    const modelEl = appendMessage('model', '');
    try {
        const response = await fetch('https://ai-assistant-backend-6n7s.onrender.com/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: currentMessages, userId: currentUser.uid })
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value).split('\n\n')) {
                if (!line.startsWith('data: ')) continue;
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') break;
                try {
                    const { text } = JSON.parse(dataStr);
                    if (text) modelEl.innerHTML = marked.parse(fullResponse += text);
                } catch { }
            }
        }
        currentMessages.push({ role: 'model', content: fullResponse });
        await addDoc(collection(db, `users/${currentUser.uid}/chats`), {
            messages: currentMessages,
            timestamp: new Date()
        });
    } catch {
        modelEl.textContent = 'Помилка мережі або сервера.';
    }
});

const appendMessage = (role, text) => {
    const div = Object.assign(document.createElement('div'), {
        className: `message ${role}`,
        innerHTML: text ? marked.parse(text) : '...'
    });
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return div;
};