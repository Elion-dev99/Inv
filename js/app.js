import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, setDoc, getDoc, getDocs, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCEYYR6xav5DEH3_R9zKXi6sWQted2tUG8",
    authDomain: "dgosk-44e71.firebaseapp.com",
    projectId: "dgosk-44e71",
    storageBucket: "dgosk-44e71.firebasestorage.app",
    messagingSenderId: "867582224758",
    appId: "1:867582224758:web:6537415c035b69e4b5b257"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const adminApp = initializeApp(firebaseConfig, "AdminApp");
const adminAuth = getAuth(adminApp);

const loginScreen = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const appScreen = document.getElementById('app-screen');
const loginMessage = document.getElementById('login-message');
const registerMessage = document.getElementById('register-message');
const appTitle = document.getElementById('app-title');
let currentUserRole = "member";
let currentUsernameCache = "名無し";
let currentUserPhotoCache = "";

const DUMMY_DOMAIN = "@inventory.local";
let validatedRegEmpCode = "";

document.getElementById('reg-emp-code').addEventListener('input', () => { validatedRegEmpCode = ""; });
window.onload = function() { setTimeout(function() { window.scrollTo(0, 0); }, 100); };

// --- 画面切り替え ---
document.getElementById('show-register-btn').addEventListener('click', () => {
    loginScreen.classList.remove('active');
    setTimeout(() => { loginScreen.style.display = 'none'; registerScreen.style.display = 'block'; setTimeout(() => registerScreen.classList.add('active'), 50); }, 500);
});

document.getElementById('show-login-btn').addEventListener('click', () => {
    registerScreen.classList.remove('active');
    setTimeout(() => { registerScreen.style.display = 'none'; loginScreen.style.display = 'block'; setTimeout(() => loginScreen.classList.add('active'), 50); }, 500);
});

document.querySelectorAll('#register-screen input[name="role"]').forEach(radio => {
    radio.addEventListener('change', (e) => { document.getElementById('admin-secret-area').style.display = e.target.value === 'admin' ? 'block' : 'none'; });
});

document.querySelectorAll('input[name="add-role"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const isOwner = e.target.value === 'owner';
        document.getElementById('add-emp-code-area').style.display = isOwner ? 'none' : 'block';
        document.getElementById('add-email-area').style.display = isOwner ? 'block' : 'none';
    });
});

function loadOrganizationSettings() {
    onSnapshot(doc(db, "settings", "general"), (docSnap) => {
        let orgName = "Future Inventory";
        if (docSnap.exists() && docSnap.data().organizationName) orgName = docSnap.data().organizationName;
        document.querySelectorAll('.auth-org-title').forEach(el => el.innerText = orgName);
        const orgInput = document.getElementById('org-name-input');
        if (orgInput && document.activeElement !== orgInput) orgInput.value = orgName;
    });
}
loadOrganizationSettings();

document.getElementById('save-org-btn').addEventListener('click', async () => {
    const newOrgName = document.getElementById('org-name-input').value;
    if (!newOrgName) return;
    const saveBtn = document.getElementById('save-org-btn'); saveBtn.innerText = "⏳"; saveBtn.disabled = true;
    try { await setDoc(doc(db, "settings", "general"), { organizationName: newOrgName }, { merge: true }); alert("組織名を更新しました！"); }
    catch (e) { alert("エラー: " + e.message); } finally { saveBtn.innerText = "更新"; saveBtn.disabled = false; }
});

function switchTab(tabId) {
    const currentActiveContent = document.querySelector('.tab-content.active');
    if(currentActiveContent && (currentActiveContent.id === 'login-screen' || currentActiveContent.id === 'register-screen')) return;

    const nextContent = document.getElementById('tab-' + tabId);
    const titles = { 'home': 'Add Item', 'list': 'Stock (Category)', 'location': 'Stock (Location)', 'order': 'Order List', 'chat': 'Messages', 'settings': 'Settings' };
    if(appTitle) appTitle.innerText = titles[tabId];

    if (currentActiveContent) {
        currentActiveContent.style.opacity = '0'; currentActiveContent.style.transform = 'translateY(15px) scale(0.98)';
        setTimeout(() => {
            currentActiveContent.classList.remove('active'); nextContent.classList.add('active');
            setTimeout(() => { nextContent.style.opacity = '1'; nextContent.style.transform = 'translateY(0) scale(1)'; window.scrollTo(0, 0); }, 50);
        }, 300);
    } else {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.getElementById('nav-' + tabId).classList.add('active'); window.scrollTo(0, 0);
    }
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.getElementById('nav-' + tabId).classList.add('active');

    if (tabId === 'chat') { setTimeout(() => { const chatContainer = document.getElementById('chat-messages'); chatContainer.scrollTop = chatContainer.scrollHeight; }, 350); }
}
['home', 'list', 'location', 'order', 'chat', 'settings'].forEach(id => { document.getElementById('nav-' + id).addEventListener('click', () => switchTab(id)); });

function toggleBtnLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId); if (!btn) return;
    let spinner = btn.querySelector('.loading-spinner') || btn.querySelector('.btn-small-spinner');
    const text = btn.querySelector('.btn-text');
    if (spinner && text) { if (isLoading) { spinner.style.display = 'block'; text.style.opacity = '0'; btn.disabled = true; } else { spinner.style.display = 'none'; text.style.opacity = '1'; btn.disabled = false; } }
}

// --- スクレイピング処理 ---
async function fetchEmployeeData(empCode, targetNameInputId, previewContainerId, previewImgId, previewNameId) {
    if (!empCode) { alert("従業員コードを入力してください。"); return false; }
    try {
        const detailUrl = `https://www.dgdgdg.com/boy/detail.php?shop_id=4&boy_id=${empCode}`;
        const listUrl = `https://www.dgdgdg.com/boy/list.php?shop_id=4`;
        const fetchWithProxy = async (url) => {
            const encodedUrl = encodeURIComponent(url);
            const proxies = [`https://corsproxy.io/?${encodedUrl}`, `https://api.codetabs.com/v1/proxy?quest=${encodedUrl}`];
            for (let proxy of proxies) { try { const res = await fetch(proxy); if (res.ok) return await res.text(); } catch (e) {} }
            throw new Error("プロキシサーバーがブロックされました。");
        };

        const detailHtml = await fetchWithProxy(detailUrl);
        const parser = new DOMParser(); const detailDoc = parser.parseFromString(detailHtml, "text/html");
        const belongShopDiv = detailDoc.querySelector('#Belongshop');
        if (!belongShopDiv || !belongShopDiv.innerText.trim().includes("大阪店")) throw new Error("この従業員は大阪店の在籍ではありません。");

        let name = ""; const titleTag = detailDoc.querySelector('title');
        if (titleTag && titleTag.innerText) name = titleTag.innerText.split(/[\s\|｜\-]/)[0].trim();
        if (!name || name.length > 15) { const h1 = detailDoc.querySelector('h1'); if (h1) name = h1.innerText.trim(); }
        if (!name) throw new Error("ページから名前を読み取れませんでした。");

        let imgUrl = "";
        try {
            const listHtml = await fetchWithProxy(listUrl);
            const listDoc = parser.parseFromString(listHtml, "text/html");
            const imgs = listDoc.querySelectorAll('img.boy_img');
            for (let img of imgs) {
                if ((img.getAttribute('alt') || '').trim() === name) {
                    const src = img.getAttribute('src');
                    if (src) { imgUrl = src.startsWith('http') ? src : `https://www.dgdgdg.com${src.startsWith('/') ? '' : '/'}${src}`; break; }
                }
            }
        } catch (e) {}

        document.getElementById(targetNameInputId).value = name;
        if (previewContainerId) {
            document.getElementById(previewNameId).innerText = name;
            document.getElementById(previewImgId).src = imgUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0071e3&color=fff`;
            document.getElementById(previewContainerId).style.display = 'flex';
        }
        return true;
    } catch (e) { alert("データの取得に失敗しました。\n(エラー詳細: " + e.message + ")"); return false; }
}

document.getElementById('fetch-reg-btn').addEventListener('click', async () => {
    toggleBtnLoading('fetch-reg-btn', true); const code = document.getElementById('reg-emp-code').value;
    const success = await fetchEmployeeData(code, 'reg-username', 'reg-profile-preview', 'reg-profile-img', 'reg-profile-name');
    if (success) { validatedRegEmpCode = code; registerMessage.textContent = ""; } else { validatedRegEmpCode = ""; }
    toggleBtnLoading('fetch-reg-btn', false);
});

document.getElementById('fetch-add-btn').addEventListener('click', async () => {
    toggleBtnLoading('fetch-add-btn', true); await fetchEmployeeData(document.getElementById('add-emp-code').value, 'add-username', 'add-profile-preview', 'add-profile-img', 'add-profile-name'); toggleBtnLoading('fetch-add-btn', false);
});

// --- 認証機能 ---
document.getElementById('register-btn').addEventListener('click', async () => {
    const empCode = document.getElementById('reg-emp-code').value; const username = document.getElementById('reg-username').value;
    const pass = document.getElementById('reg-password').value; const role = document.querySelector('#register-screen input[name="role"]:checked').value;
    if (!empCode || pass.length < 6) return registerMessage.textContent = "従業員コードと6文字以上のパスワードを入力してください。";
    if (empCode !== validatedRegEmpCode) return registerMessage.textContent = "先に「情報を取得」を押して、大阪店の在籍確認を行ってください。";
    if (role === 'admin' && document.getElementById('admin-secret').value !== '7777') return registerMessage.textContent = "管理者用パスコードが間違っています。";

    toggleBtnLoading('register-btn', true);
    const secretEmail = empCode + DUMMY_DOMAIN;
    const fetchedImgSrc = document.getElementById('reg-profile-img').src; const profileImageUrl = fetchedImgSrc.includes('dgdgdg.com') ? fetchedImgSrc : "";

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, secretEmail, pass);
        await setDoc(doc(db, "users", userCredential.user.uid), { empCode: empCode, username: username || `ユーザー${empCode}`, email: secretEmail, role: role, profileImageUrl: profileImageUrl, isActive: true, createdAt: new Date() });
    } catch (err) { registerMessage.textContent = err.code === 'auth/email-already-in-use' ? "この従業員コードは既に使われています。" : "エラー: " + err.message; }
    finally { toggleBtnLoading('register-btn', false); }
});

document.getElementById('login-btn').addEventListener('click', () => {
    const inputVal = document.getElementById('login-emp-code').value;
    const pass = document.getElementById('login-password').value;
    if (!inputVal || !pass) return loginMessage.textContent = "入力が不足しています。";
    toggleBtnLoading('login-btn', true);

    const loginEmail = inputVal.includes('@') ? inputVal : inputVal + DUMMY_DOMAIN;

    signInWithEmailAndPassword(auth, loginEmail, pass).catch(err => {
        loginMessage.textContent = "サインイン失敗: ID/メールかパスワードが違います。";
        toggleBtnLoading('login-btn', false);
    });
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

const adminAddBtn = document.getElementById('admin-add-user-btn');
if (adminAddBtn) {
    adminAddBtn.addEventListener('click', async () => {
        const role = document.querySelector('input[name="add-role"]:checked').value;
        const username = document.getElementById('add-username').value;
        const pass = document.getElementById('add-password').value;
        if (!username || pass.length < 6) return alert("ユーザー名と6文字以上のパスワードを入力してください。");

        let secretEmail = "";
        let dbEmpCode = "";
        let profileImageUrl = "";

        if (role === 'owner') {
            const email = document.getElementById('add-email').value;
            if (!email || !email.includes('@')) return alert("正しいメールアドレスを入力してください。");
            secretEmail = email;
            dbEmpCode = "owner";
        } else {
            const empCodeInput = document.getElementById('add-emp-code').value;
            const empCode = empCodeInput || `manual_${Math.floor(Math.random() * 100000)}`;
            secretEmail = empCode + DUMMY_DOMAIN;
            dbEmpCode = empCode.startsWith('manual_') ? '' : empCode;

            const addProfilePreview = document.getElementById('add-profile-preview');
            if (addProfilePreview.style.display !== 'none') {
                const fetchedImgSrc = document.getElementById('add-profile-img').src;
                profileImageUrl = fetchedImgSrc.includes('dgdgdg.com') ? fetchedImgSrc : "";
            }
        }

        toggleBtnLoading('admin-add-user-btn', true);

        try {
            const userCredential = await createUserWithEmailAndPassword(adminAuth, secretEmail, pass);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                empCode: dbEmpCode,
                username: username,
                email: secretEmail,
                role: role,
                profileImageUrl: profileImageUrl,
                isActive: true,
                createdAt: new Date()
            });
            await signOut(adminAuth);

            const roleLabels = { 'member': '一般メンバー', 'admin': '管理者', 'owner': 'オーナー' };
            alert(`${username}さんを${roleLabels[role]}として追加しました！`);

            document.getElementById('add-emp-code').value = '';
            document.getElementById('add-email').value = '';
            document.getElementById('add-username').value = '';
            document.getElementById('add-password').value = '';
            document.getElementById('add-profile-preview').style.display = 'none';
        } catch (err) {
            alert(err.code === 'auth/email-already-in-use' ? "エラー: このID/メールアドレスは既に登録されています。" : "エラー: " + err.message);
        }
        finally { toggleBtnLoading('admin-add-user-btn', false); }
    });
}

document.getElementById('update-profile-btn').addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return;
    const newName = document.getElementById('profile-username').value; const newPass = document.getElementById('profile-password').value;
    toggleBtnLoading('update-profile-btn', true);

    try {
        let updated = false;
        if (newName) { await setDoc(doc(db, "users", user.uid), { username: newName }, { merge: true }); updated = true; currentUsernameCache = newName; document.getElementById('account-info').querySelector('h2').innerText = newName; }
        if (newPass) { await updatePassword(user, newPass); document.getElementById('profile-password').value = ''; updated = true; }
        if (updated) alert("プロフィールを更新しました！");
    } catch (e) { alert(e.code === 'auth/requires-recent-login' ? "【重要】パスワードを変更するには一度サインアウトし、再度サインインし直す必要があります。" : "エラー: " + e.message); }
    finally { toggleBtnLoading('update-profile-btn', false); }
});

// --- チャット機能 ---
function getChatRoomId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }
let currentChatTarget = "all";
let unsubscribeMessages = null;
let globalUsersCache = [];
let isChatTabActive = false;

// ▼ 未読バッジ（ピン）のグローバル監視
function setupUnreadListener() {
    onSnapshot(query(collection(db, "messages"), orderBy("createdAt", "desc")), (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === "added" && !isChatTabActive && change.doc.data().senderId !== auth.currentUser?.uid) {
                document.getElementById('nav-chat').classList.add('has-unread');
            }
        });
    });
    onSnapshot(query(collection(db, "directMessages"), orderBy("createdAt", "desc")), (snap) => {
        snap.docChanges().forEach(change => {
            const data = change.doc.data();
            if (change.type === "added" && !isChatTabActive && data.receiverId === auth.currentUser?.uid) {
                document.getElementById('nav-chat').classList.add('has-unread');
            }
        });
    });
}

// ▼ タブ切り替え時の処理（スクロールロックと表示リセット）
const originalSwitchTab = switchTab;
switchTab = function(tabId) {
    originalSwitchTab(tabId);
    isChatTabActive = (tabId === 'chat');

    const appHeader = document.querySelector('#app-screen .app-header');
    if (appHeader) appHeader.style.display = isChatTabActive ? 'none' : 'block';

    if (isChatTabActive) {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        document.getElementById('nav-chat').classList.remove('has-unread');
        renderChatList();
    } else {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        // 他のタブ移動時は一覧画面に戻す
        const chatListView = document.getElementById('chat-list-view');
        const chatRoomView = document.getElementById('chat-room-view');
        if(chatListView) chatListView.style.transform = 'translateX(0)';
        if(chatRoomView) chatRoomView.style.transform = 'translateX(100%)';
    }
};

// ▼ LINE風 トーク一覧の描画
function renderChatList() {
    const listContainer = document.getElementById('chat-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    // 1. 全体チャットの行を作成
    const allItem = document.createElement('div');
    allItem.className = 'chat-list-item';
    allItem.innerHTML = `
        <img src="https://ui-avatars.com/api/?name=ALL&background=0071e3&color=fff" class="chat-list-avatar">
        <div class="chat-list-info">
            <div class="chat-list-name">📢 全体チャット <span class="chat-list-time">常時</span></div>
            <div class="chat-list-preview">全メンバーに送信されます</div>
        </div>
        <div style="color: #c7c7cc; font-weight: 800; font-size: 20px; margin-left: 10px;">›</div>
    `;
    allItem.onclick = () => showChatRoom("all", "📢 全体チャット");
    listContainer.appendChild(allItem);

    // 2. メンバーとの個別DM行を作成
    globalUsersCache.forEach(userObj => {
        if (userObj.id === auth.currentUser?.uid || userObj.data.isActive === false) return;
        const name = userObj.data.username || "名無し";
        const img = userObj.data.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=86868b&color=fff`;

        const dmItem = document.createElement('div');
        dmItem.className = 'chat-list-item';
        dmItem.innerHTML = `
            <img src="${img}" class="chat-list-avatar">
            <div class="chat-list-info">
                <div class="chat-list-name">👤 ${name} <span class="chat-list-time">DM</span></div>
                <div class="chat-list-preview">個別メッセージを送る</div>
            </div>
            <div style="color: #c7c7cc; font-weight: 800; font-size: 20px; margin-left: 10px;">›</div>
        `;
        dmItem.onclick = () => showChatRoom(userObj.id, `👤 ${name}`);
        listContainer.appendChild(dmItem);
    });
}

// ▼ 画面の切り替え（一覧 ⇔ ルーム）
function showChatRoom(targetId, titleName) {
    currentChatTarget = targetId;
    document.getElementById('chat-room-title').innerText = titleName;
    document.getElementById('chat-list-view').style.transform = 'translateX(-100%)';
    document.getElementById('chat-room-view').style.transform = 'translateX(0)';
    loadMessages();
}
document.getElementById('chat-back-btn').addEventListener('click', () => {
    document.getElementById('chat-list-view').style.transform = 'translateX(0)';
    document.getElementById('chat-room-view').style.transform = 'translateX(100%)';
    if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
});

// ▼ 送信処理
document.getElementById('send-message-btn').addEventListener('click', async () => {
    const txtInput = document.getElementById('message-input');
    const txt = txtInput.value;
    if (!txt.trim()) return;
    toggleBtnLoading('send-message-btn', true);
    try {
        const baseData = {
            text: txt, senderName: currentUsernameCache || "名無し", senderPhoto: currentUserPhotoCache || "",
            senderId: auth.currentUser.uid, role: currentUserRole || "member", createdAt: new Date(), isDeleted: false
        };
        if (currentChatTarget === "all") {
            await addDoc(collection(db, "messages"), baseData);
        } else {
            baseData.roomId = getChatRoomId(auth.currentUser.uid, currentChatTarget);
            baseData.receiverId = currentChatTarget;
            await addDoc(collection(db, "directMessages"), baseData);
        }
        txtInput.value = '';
    } catch(e) { alert("送信エラー: " + e.message); console.error(e); }
    finally { toggleBtnLoading('send-message-btn', false); }
});

// ▼ メッセージ読み込み（「読み込み中バグ」を修正済）
function loadMessages() {
    if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div style="text-align:center; color:#888; font-size:13px; margin-top:20px;">読み込み中...</div>';

    let q;
    if (currentChatTarget === "all") {
        q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    } else {
        const roomId = getChatRoomId(auth.currentUser.uid, currentChatTarget);
        // ※ Firestoreエラー回避のため、ここでは orderBy を使わず、下の JavaScript 内で並べ替えます
        q = query(collection(db, "directMessages"), where("roomId", "==", roomId));
    }

    unsubscribeMessages = onSnapshot(q, (snap) => {
        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = `<div style="text-align:center; color:#888; font-size:12px; margin-top:20px;">最初のメッセージを送ってみましょう！</div>`;
            return;
        }

        // JavaScript側で時間順に並べ替え（読み込みバグの完全な解決策）
        let docsData = [];
        snap.forEach(d => docsData.push({ id: d.id, data: d.data() }));
        docsData.sort((a, b) => {
            const tA = a.data.createdAt ? a.data.createdAt.seconds : 0;
            const tB = b.data.createdAt ? b.data.createdAt.seconds : 0;
            return tA - tB;
        });

        docsData.forEach(dObj => {
            const data = dObj.data; const docId = dObj.id;
            const isMe = data.senderId === auth.currentUser?.uid;
            const safeName = data.senderName || "名無し";

            let timeDisplay = '';
            if (data.createdAt) {
                const dateObj = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                const now = new Date();
                const isToday = dateObj.getFullYear() === now.getFullYear() && dateObj.getMonth() === now.getMonth() && dateObj.getDate() === now.getDate();
                timeDisplay = isToday ? `今日 ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : `${dateObj.getMonth() + 1}/${dateObj.getDate()} ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            }

            const div = document.createElement('div');
            if (data.isDeleted) {
                div.style.width = "100%"; div.style.textAlign = "center"; div.style.margin = "10px 0";
                div.innerHTML = `<div style="display:inline-block; color:var(--text-sub); font-size:11px; background: rgba(0,0,0,0.03); padding: 4px 12px; border-radius: 12px;">${safeName}が送信を取り消しました</div>`;
                container.appendChild(div); return;
            }

            div.className = `chat-message-row ${isMe ? 'chat-me' : 'chat-other'}`;
            const avatarImg = data.senderPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=0071e3&color=fff&rounded=true`;
            const avatarHtml = isMe ? '' : `<img src="${avatarImg}" class="chat-avatar">`;
            const roleIcon = data.role === 'owner' ? '👑' : data.role === 'admin' ? '🏢' : '';

            if (isMe) {
                div.innerHTML = `<div class="chat-time-wrap"><button class="chat-delete-btn" data-id="${docId}">取消</button><span class="chat-time">${timeDisplay}</span></div><div class="chat-bubble-col"><div class="chat-bubble">${(data.text || "").replace(/\n/g, '<br>')}</div></div>`;
            } else {
                div.innerHTML = `${avatarHtml}<div class="chat-bubble-col"><div class="chat-meta"><span>${safeName} ${roleIcon}</span></div><div class="chat-bubble">${(data.text || "").replace(/\n/g, '<br>')}</div></div><div class="chat-time-wrap"><span class="chat-time">${timeDisplay}</span></div>`;
            }
            container.appendChild(div);

            if (isMe) {
                div.querySelector('.chat-delete-btn').onclick = () => {
                    openActionSheet(`
                        <h3 style="margin-top: 0; font-size: 24px; font-weight: 800; margin-bottom: 20px; color: var(--danger-color);">送信の取消</h3>
                        <div class="input-group-card" style="border-color: rgba(255,59,48,0.3); background: rgba(255,59,48,0.05);">
                            <label class="input-label" style="color: var(--danger-color);">⚠️ 確認</label>
                            <div style="font-size: 13px; font-weight: 700; color: var(--danger-color); padding-left: 5px;">このメッセージを取り消しますか？<br>（履歴は残ります）</div>
                        </div>
                        <div class="flex-row" style="margin-top: 25px; gap: 15px;"><button class="btn-main" id="confirm-sheet-msg-delete" style="flex: 2; margin-bottom: 0; background: linear-gradient(135deg, #ff3b30, #d70015); box-shadow: 0 4px 15px rgba(255, 59, 48, 0.3);">取り消す</button><button class="btn-sub" id="cancel-sheet-btn" style="flex: 1; margin-bottom: 0;">キャンセル</button></div>
                    `);
                    document.getElementById('cancel-sheet-btn').onclick = closeActionSheet;
                    document.getElementById('confirm-sheet-msg-delete').onclick = async () => {
                        const collName = currentChatTarget === "all" ? "messages" : "directMessages";
                        await updateDoc(doc(db, collName, docId), { isDeleted: true });
                        closeActionSheet();
                    };
                };
            }
        });
        // ▼ メッセージ描画後に一番下までスムーズにスクロールさせる
        setTimeout(() => {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    });
}

// --- 発注リスト ---
async function addToOrderList(name, quantity, unit) {
    const q = query(collection(db, "orderList"), where("name", "==", name)); const snap = await getDocs(q);
    if (!snap.empty) { const d = snap.docs[0]; await updateDoc(doc(db, "orderList", d.id), { quantity: d.data().quantity + quantity, unit: unit }); }
    else { await addDoc(collection(db, "orderList"), { name, quantity, unit: unit || '個', createdAt: new Date() }); }
}

function loadOrderList() {
    onSnapshot(query(collection(db, "orderList"), orderBy("createdAt", "asc")), (snap) => {
        const listEl = document.getElementById('order-list'); listEl.innerHTML = '';
        if (snap.empty) { listEl.innerHTML = '<li style="font-size: 13px; color: #888; text-align: center;">リストは空です</li>'; return; }
        snap.forEach(d => {
            const data = d.data(); const li = document.createElement('li'); li.className = 'order-list-item';
            const unitText = data.unit || '個';
            li.innerHTML = `
<div class="modern-item-top">
    <div class="item-image-box" style="height: 70px;">${imageHtml}</div>

    <div class="modern-item-header" style="height: 75px !important; display: flex; flex-direction: column; justify-content: flex-start; gap: 4px; margin-bottom: 8px;">
        <div class="modern-item-title" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; height: 3.6em; font-weight: 800; font-size: 14px;">
            ${data.name}
        </div>
        ${locOptionsHtml}
    </div>
</div>

<div class="glass-stepper" style="margin-top: 0 !important;">
    <button class="stepper-btn minus btn-qty-minus" style="position: relative; top: 4px;">-</button>
    <div class="stepper-center">
        <input type="number" class="stepper-input input-qty" value="${data.quantity}">
        <span class="stepper-unit" style="position: relative; top: 4px;">${unitText}</span>
    </div>
    <button class="stepper-btn plus btn-qty-plus" style="position: relative; top: 4px;">+</button>
</div>

<div class="modern-item-actions">
    ${editBtnHtml}
    <button class="modern-action-btn order btn-order small">🛒 発注</button>
    ${deleteBtnHtml}
</div>
```

`;
listEl.appendChild(li);
});
});
}

```
window.removeOrderItem = (id) => deleteDoc(doc(db, "orderList", id));

document.getElementById('add-to-order-btn').addEventListener('click', async () => {
    const selectEl = document.getElementById('order-item-select');
    const name = selectEl.value;
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const unit = selectedOption ? (selectedOption.dataset.unit || '個') : '個';
    const qtyStr = document.getElementById('order-quantity').value;
    const qty = parseInt(qtyStr, 10);

    if (!name || isNaN(qty) || qty <= 0) { alert("アイテムと正しい個数を選択してください。"); return; }
    const btn = document.getElementById('add-to-order-btn'); btn.innerText = "⏳"; btn.disabled = true;
    await addToOrderList(name, qty, unit);
    selectEl.value = ''; document.getElementById('order-quantity').value = '';
    btn.innerText = "リストへ"; btn.disabled = false;
});

document.getElementById('clear-order-btn').addEventListener('click', async () => { if (!confirm("発注リストをすべてクリアしますか？")) return; const snap = await getDocs(collection(db, "orderList")); snap.forEach(d => deleteDoc(doc(db, "orderList", d.id))); });

document.getElementById('download-order-csv-btn').addEventListener('click', async () => {
    const snap = await getDocs(collection(db, "orderList")); if (snap.empty) { alert("発注リストが空です。"); return; }
    let csvContent = "\uFEFF発注日,アイテム名,発注数,単位\n"; const today = new Date().toLocaleDateString(); snap.forEach(d => { csvContent += `${today},${d.data().name},${d.data().quantity},${d.data().unit || '個'}\n`; });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", `OrderList_${today.replace(/\//g, '')}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

document.getElementById('download-all-csv-btn').addEventListener('click', async () => {
    const q = query(collection(db, "inventoryItems"), orderBy("category", "asc"), orderBy("name", "asc")); const snapshot = await getDocs(q);
    if (snapshot.empty) { alert("データがありません。"); return; }
    let csvContent = "\uFEFFカテゴリ,アイテム名,数量,単位,保管場所,バーコード,記録日時\n";
    snapshot.forEach(docSnap => { const data = docSnap.data(); const dateStr = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString() : "不明"; csvContent += `${data.category || "未分類"},${data.name},${data.quantity},${data.unit || '個'},${data.location || "場所未設定"},${data.barcode || ""},${dateStr}\n`; });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", `All_Inventory_${new Date().toLocaleDateString().replace(/\//g, '')}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

// --- 在庫管理 ---
let html5QrcodeScanner = null;
document.getElementById('start-camera-btn').addEventListener('click', () => {
    document.getElementById('camera-area').style.display = 'block';
    if (!html5QrcodeScanner) html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (decodedText) => { document.getElementById('item-barcode').value = decodedText; html5QrcodeScanner.stop().then(() => { document.getElementById('camera-area').style.display = 'none'; }); }, () => {});
});
document.getElementById('stop-camera-btn').addEventListener('click', () => { if (html5QrcodeScanner) html5QrcodeScanner.stop().then(() => document.getElementById('camera-area').style.display = 'none'); });

document.getElementById('add-btn').addEventListener('click', async () => {
    const name = document.getElementById('item-name').value; const quantity = document.getElementById('item-quantity').value;
    const unit = document.getElementById('item-unit').value || '個';
    if (!name || !quantity) return alert("名前と数量は必須です！");
    toggleBtnLoading('add-btn', true);
    try {
        let imageUrl = ""; const imageFile = document.getElementById('item-image').files[0];
        if (imageFile) { const storageRef = ref(storage, 'images/' + Date.now() + '_' + imageFile.name); await uploadBytes(storageRef, imageFile); imageUrl = await getDownloadURL(storageRef); }
        await addDoc(collection(db, "inventoryItems"), { name, quantity: Number(quantity), unit: unit, category: document.getElementById('item-category').value || '未分類', location: document.getElementById('item-location').value || '場所未設定', barcode: document.getElementById('item-barcode').value, imageUrl, createdAt: new Date() });

        document.getElementById('item-name').value = ''; document.getElementById('item-quantity').value = ''; document.getElementById('item-unit').value = '個'; document.getElementById('item-category').value = ''; document.getElementById('item-location').value = ''; document.getElementById('item-barcode').value = ''; document.getElementById('item-image').value = '';

        alert("追加しました！"); switchTab('list');
    } catch (e) { alert("エラー: " + e.message); } finally { toggleBtnLoading('add-btn', false); }
});

let currentEditId = ""; const editModal = document.getElementById('edit-modal');
document.getElementById('cancel-edit-btn').addEventListener('click', () => { editModal.classList.remove('active'); setTimeout(() => editModal.style.display = 'none', 400); });
document.getElementById('save-edit-btn').addEventListener('click', async () => {
    if (!currentEditId) return;
    const updatedData = {
        name: document.getElementById('edit-name').value,
        quantity: Number(document.getElementById('edit-quantity').value),
        unit: document.getElementById('edit-unit').value || '個',
        category: document.getElementById('edit-category').value || '未分類',
        location: document.getElementById('edit-location').value || '場所未設定',
        barcode: document.getElementById('edit-barcode').value
    };
    try { await updateDoc(doc(db, "inventoryItems", currentEditId), updatedData); document.getElementById('cancel-edit-btn').click(); } catch(e) { alert("エラー: " + e.message); }
});

function renderItems(container, items, groupBy, locArray, isEditable = false) {
    container.innerHTML = ''; const grouped = {};
    items.forEach(itemObj => { const key = itemObj.data[groupBy] || (groupBy === 'category' ? '未分類' : '場所未設定'); if (!grouped[key]) grouped[key] = []; grouped[key].push(itemObj); });

    const canEditDetails = currentUserRole === 'admin' || currentUserRole === 'owner';

    Object.keys(grouped).sort().forEach(groupKey => {
        const header = document.createElement('h3'); header.className = 'category-header'; const icon = groupBy === 'category' ? '🏷️ ' : '📍 ';
        header.innerHTML = `${icon}${groupKey} <span>${grouped[groupKey].length}件</span>`; container.appendChild(header);
        const ul = document.createElement('ul'); ul.className = 'inventory-list';

        grouped[groupKey].forEach(itemObj => {
            const data = itemObj.data; const id = itemObj.id; const li = document.createElement('li');
            li.className = 'modern-item-card liquid-panel';
            const imageHtml = data.imageUrl ? `<img src="${data.imageUrl}" alt="備品">` : `<span style="color: #888; font-size: 11px; font-weight:600;">NO IMAGE</span>`;
            const locationText = data.location || '場所未設定';
            const unitText = data.unit || '個';

            if (isEditable) {
                let locOptionsHtml = `<div class="modern-location-badge">📍 ${locationText}</div>`;
                if (canEditDetails) {
                    let options = `<option value="場所未設定">場所未設定</option>`;
                    locArray.forEach(loc => { if(loc && loc !== '場所未設定') { options += `<option value="${loc}" ${data.location === loc ? 'selected' : ''}>${loc}</option>`; } });
                    locOptionsHtml = `<select class="modern-location-select quick-location-change">${options}</select>`;
                }

                const editBtnHtml = canEditDetails ? `<button class="modern-action-btn edit btn-edit small">編集</button>` : '';
                const deleteBtnHtml = canEditDetails ? `<button class="modern-action-btn delete btn-delete small">削除</button>` : '';

                // ★ 修正された Liquid Glass ピル型ステッパー
                // ここに position: relative; top: 4px; を追加してボタンのみを下にずらしました。
                li.innerHTML = `
                    <div class="modern-item-top">
                        <div class="item-image-box" style="height: 70px;">${imageHtml}</div>
                        <div class="modern-item-header">
                            <div class="modern-item-title">${data.name}</div>
                            ${locOptionsHtml}
                        </div>
                    </div>

                    <div class="glass-stepper">
                        <button class="stepper-btn minus btn-qty-minus" style="position: relative; top: 4px;">-</button>
                        <div class="stepper-center">
                            <input type="number" class="stepper-input input-qty" value="${data.quantity}">
                            <span class="stepper-unit">${unitText}</span>
                        </div>
                        <button class="stepper-btn plus btn-qty-plus" style="position: relative; top: 6px;">+</button>
                    </div>

                    <div class="modern-item-actions">
                        ${editBtnHtml}
                        <button class="modern-action-btn order btn-order small">発注</button>
                        ${deleteBtnHtml}
                    </div>
                `;

                li.querySelector('.btn-qty-plus').addEventListener('click', async () => { await updateDoc(doc(db, "inventoryItems", id), { quantity: Number(data.quantity) + 1 }); });
                li.querySelector('.btn-qty-minus').addEventListener('click', async () => { if (data.quantity > 0) { await updateDoc(doc(db, "inventoryItems", id), { quantity: Number(data.quantity) - 1 }); } });

                const inputQty = li.querySelector('.input-qty');
                inputQty.addEventListener('change', async (e) => {
                    let newQty = parseInt(e.target.value, 10);
                    if(isNaN(newQty) || newQty < 0) newQty = 0;
                    await updateDoc(doc(db, "inventoryItems", id), { quantity: newQty });
                });

                // ▼ 発注ボタン（アイテム編集デザイン統一版）
                li.querySelector('.btn-order').addEventListener('click', () => {
                    openActionSheet(`
                        <h3 style="margin-top: 0; font-size: 24px; font-weight: 800; margin-bottom: 20px; color: var(--text-main);">アイテム発注</h3>
                        <div class="input-group-card" style="background: rgba(255, 255, 255, 0.8);">
                            <label class="input-label">🏷️ アイテム名</label>
                            <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px; padding-left: 5px; color: var(--text-main);">${data.name}</div>

                            <label class="input-label">📦 発注数量 / 単位</label>
                            <div class="glass-stepper" style="margin-bottom: 0; padding: 4px; border-radius: 20px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);">
                                <button class="stepper-btn minus" id="sheet-btn-minus" style="width: 40px; height: 40px; font-size: 24px; position: relative; top: 0;">-</button>
                                <div class="stepper-center">
                                    <input type="number" id="sheet-qty" class="stepper-input" value="1" min="1" style="font-size: 24px; max-width: 80px; box-shadow: none !important; background: transparent !important; margin: 0 !important;">
                                    <span class="stepper-unit" style="font-size: 14px; position: relative; top: 0;">${unitText}</span>
                                </div>
                                <button class="stepper-btn plus" id="sheet-btn-plus" style="width: 40px; height: 40px; font-size: 24px; position: relative; top: 0;">+</button>
                            </div>
                        </div>
                        <div class="flex-row" style="margin-top: 25px; gap: 15px;">
                            <button class="btn-main" id="confirm-sheet-order" style="flex: 2; margin-bottom: 0;">発注する</button>
                            <button class="btn-sub" id="cancel-sheet-btn" style="flex: 1; margin-bottom: 0;">キャンセル</button>
                        </div>
                    `);

                    document.getElementById('cancel-sheet-btn').onclick = closeActionSheet;
                    const qtyInput = document.getElementById('sheet-qty');

                    document.getElementById('sheet-btn-minus').onclick = () => {
                        let val = parseInt(qtyInput.value, 10) || 1;
                        if (val > 1) qtyInput.value = val - 1;
                    };
                    document.getElementById('sheet-btn-plus').onclick = () => {
                        let val = parseInt(qtyInput.value, 10) || 0;
                        qtyInput.value = val + 1;
                    };
                    document.getElementById('confirm-sheet-order').onclick = async () => {
                        const qty = parseInt(qtyInput.value, 10);
                        if (qty > 0) {
                            await addToOrderList(data.name, qty, unitText);
                            alert("発注リストに追加しました！");
                            closeActionSheet();
                        } else {
                            alert("正しい数値を入力してください。");
                        }
                    };
                });

                if (canEditDetails) {
                    li.querySelector('.quick-location-change').addEventListener('change', async (e) => { await updateDoc(doc(db, "inventoryItems", id), { location: e.target.value }); });

                    // ▼ 削除ボタン（アイテム編集デザイン統一版）
                    li.querySelector('.btn-delete').addEventListener('click', () => {
                        openActionSheet(`
                            <h3 style="margin-top: 0; font-size: 24px; font-weight: 800; margin-bottom: 20px; color: var(--danger-color);">アイテムの削除</h3>
                            <div class="input-group-card" style="border-color: rgba(255,59,48,0.3); background: rgba(255,59,48,0.05);">
                                <label class="input-label" style="color: var(--danger-color);">🏷️ 対象アイテム</label>
                                <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px; padding-left: 5px; color: var(--text-main);">${data.name}</div>
                                <label class="input-label" style="color: var(--danger-color);">⚠️ 警告</label>
                                <div style="font-size: 13px; font-weight: 700; color: var(--danger-color); padding-left: 5px;">リストから完全に削除します。<br>この操作は取り消せません。</div>
                            </div>
                            <div class="flex-row" style="margin-top: 25px; gap: 15px;">
                                <button class="btn-main" id="confirm-sheet-delete" style="flex: 2; margin-bottom: 0; background: linear-gradient(135deg, #ff3b30, #d70015); box-shadow: 0 4px 15px rgba(255, 59, 48, 0.3);">削除する</button>
                                <button class="btn-sub" id="cancel-sheet-btn" style="flex: 1; margin-bottom: 0;">キャンセル</button>
                            </div>
                        `);
                        document.getElementById('cancel-sheet-btn').onclick = closeActionSheet;
                        document.getElementById('confirm-sheet-delete').onclick = async () => {
                            await deleteDoc(doc(db, "inventoryItems", id));
                            closeActionSheet();
                        };
                    });

                    li.querySelector('.btn-edit').addEventListener('click', () => {
                        currentEditId = id;
                        document.getElementById('edit-name').value = data.name;
                        document.getElementById('edit-quantity').value = data.quantity;
                        document.getElementById('edit-unit').value = unitText;
                        document.getElementById('edit-category').value = data.category || '';
                        document.getElementById('edit-location').value = data.location || '';
                        document.getElementById('edit-barcode').value = data.barcode || '';
                        editModal.style.display = 'flex'; setTimeout(() => editModal.classList.add('active'), 10);
                    });
                }

            } else {
                li.innerHTML = `
                    <div class="modern-item-top">
                        <div class="item-image-box">${imageHtml}</div>
                        <div class="modern-item-header">
                            <div class="modern-item-title">${data.name}</div>
                            <div class="modern-location-badge">📍 ${locationText}</div>
                        </div>
                    </div>
                    <div class="modern-item-controls" style="background: transparent; border: none; box-shadow: none; padding: 0;">
                        <div style="font-size: 12px; color: var(--text-sub); font-weight: 700; margin-right: 8px;">在庫数</div>
                        <div style="font-size: 20px; font-weight: 800; color: var(--accent-color);">${data.quantity} <span style="font-size:14px; margin-left:4px;">${unitText}</span></div>
                    </div>
                `;
            }

            ul.appendChild(li);
        });
        container.appendChild(ul);
    });
}

function loadInventory() {
    const q = query(collection(db, "inventoryItems"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const inventoryContainer = document.getElementById('inventory-container'); const locationContainer = document.getElementById('location-container');
        const selectBox = document.getElementById('order-item-select'); const catList = document.getElementById('global-category-list'); const locList = document.getElementById('global-location-list');
        if (catList) catList.innerHTML = ''; if (locList) locList.innerHTML = ''; selectBox.innerHTML = '<option value="">アイテムを選択してください...</option>';

        let allItems = []; let uniqueLocations = new Set(); let uniqueCategories = new Set();

        snapshot.forEach((docSnap) => {
            const data = docSnap.data(); allItems.push({ id: docSnap.id, data: data });
            const loc = data.location || '場所未設定'; const cat = data.category || '未分類';
            uniqueLocations.add(loc); uniqueCategories.add(cat);

            const unitText = data.unit || '個';
            const option = document.createElement('option');
            option.value = data.name;
            option.dataset.unit = unitText;
            option.textContent = `[${cat}] ${data.name} (現在: ${data.quantity} ${unitText})`;
            selectBox.appendChild(option);
        });

        const locArray = Array.from(uniqueLocations).sort();
        locArray.forEach(loc => { if (loc !== '場所未設定') { const dlOption = document.createElement('option'); dlOption.value = loc; if (locList) locList.appendChild(dlOption); } });
        Array.from(uniqueCategories).sort().forEach(cat => { if (cat !== '未分類') { const opt = document.createElement('option'); opt.value = cat; if (catList) catList.appendChild(opt); } });

        if (inventoryContainer) renderItems(inventoryContainer, allItems, 'category', locArray, true);
        if (locationContainer) renderItems(locationContainer, allItems, 'location', locArray, false);
    });
}

function loadUsers() {
    const q = query(collection(db, "users"));
    onSnapshot(q, (snapshot) => {
        const userList = document.getElementById('user-list'); userList.innerHTML = '';
        // ▼ 追加：宛先セレクトボックスのリセット
        const chatSelect = document.getElementById('chat-target-select');
        if (chatSelect) chatSelect.innerHTML = '<option value="all">📢 全体チャット</option>';
        let usersData = []; snapshot.forEach((docSnap) => { usersData.push({ id: docSnap.id, data: docSnap.data() }); });
        // ユーザーデータをグローバル変数に保存（チャット一覧用）
        globalUsersCache = usersData;

        usersData.sort((a, b) => {
            const wA = a.data.role === 'owner' ? 3 : a.data.role === 'admin' ? 2 : 1;
            const wB = b.data.role === 'owner' ? 3 : b.data.role === 'admin' ? 2 : 1;
            if (wA !== wB) return wB - wA;

            const hasTimeA = !!a.data.createdAt; const hasTimeB = !!b.data.createdAt;
            if (hasTimeA && !hasTimeB) return -1; if (!hasTimeA && hasTimeB) return 1;
            if (hasTimeA && hasTimeB) return a.data.createdAt.seconds - b.data.createdAt.seconds;
            return 0;
        });

        usersData.forEach((userObj) => {
            const userData = userObj.data; const docId = userObj.id; const li = document.createElement('li');
            const isActive = userData.isActive !== false; li.className = `user-list-item liquid-panel ${isActive ? '' : 'item-inactive'}`;

            const roleText = userData.role === 'owner' ? '<span style="color: #ff9f0a; font-weight: bold;">👑 オーナー</span>' :
                userData.role === 'admin' ? '<span style="color: var(--accent-color); font-weight: bold;">🏢 管理者</span>' : '👤 一般';

            let empCodeDisplay = "ID未設定";
            if ((userData.role === 'admin' || userData.role === 'owner') && currentUserRole !== 'admin' && currentUserRole !== 'owner') {
                empCodeDisplay = "ID: *** (非公開)";
            } else if (userData.role === 'owner' && userData.email) {
                empCodeDisplay = `✉️ ${userData.email}`;
            } else if (userData.empCode) {
                empCodeDisplay = `ID: ${userData.empCode}`;
            }

            const displayName = userData.username || "名無し";
            const profileImgUrl = userData.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0071e3&color=fff&rounded=true`;
            const statusBadge = isActive ? '' : '<span class="status-badge-inactive">停止中</span>';

            // ▼ 追加：自分以外の有効なメンバーを、DMの宛先に追加する
            if (docId !== auth.currentUser?.uid && isActive && chatSelect) {
                const opt = document.createElement('option');
                opt.value = docId;
                opt.textContent = `👤 ${displayName} とのDM`;
                chatSelect.appendChild(opt);
            }

            let actionHtml = '';
            if (currentUserRole === 'admin' || currentUserRole === 'owner') {
                const isSelf = docId === auth.currentUser?.uid;
                const targetRole = userData.role || 'member';

                if (isSelf) {
                    actionHtml = `<div style="margin-top: 15px; text-align: center; padding: 10px; background: rgba(0, 113, 227, 0.1); border-radius: 15px; font-size: 13px; font-weight: 700; color: var(--accent-color);">あなたのアカウント（操作不可）</div>`;
                } else if (currentUserRole === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) {
                    actionHtml = `<div style="margin-top: 15px; text-align: center; padding: 10px; background: rgba(134, 134, 139, 0.1); border-radius: 15px; font-size: 13px; font-weight: 700; color: var(--text-sub);">上位または同等権限（操作不可）</div>`;
                } else {
                    const toggleStatusBtn = isActive ? `<button class="btn-sub btn-toggle-status" style="color: var(--warning-color);">停止</button>` : `<button class="btn-sub btn-toggle-status" style="color: var(--success-color);">復旧</button>`;
                    actionHtml = `<div class="user-list-actions" style="margin-top: 15px;"><button class="btn-sub btn-change-role" ${!isActive ? 'disabled style="opacity: 0.5;"' : ''}>権限</button>${toggleStatusBtn}<button class="btn-sub btn-delete-user" style="color: var(--danger-color);">削除</button></div>`;
                }
            }

            li.innerHTML = `<div class="user-list-info"><img src="${profileImgUrl}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; margin-right: 12px; border: 1px solid rgba(0,0,0,0.1);"><div><div style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">${displayName} ${statusBadge}</div><div style="font-size: 12px; color: var(--text-sub); font-weight: 500;">${empCodeDisplay} | 権限: ${roleText}</div></div></div>${actionHtml}`;

            if (actionHtml && actionHtml.includes('btn-change-role')) {
                // ▼ 権限変更
                li.querySelector('.btn-change-role').onclick = () => {
                    if (!isActive) return;
                    let nextRole = 'member';
                    if (userData.role === 'member') nextRole = 'admin';
                    else if (userData.role === 'admin') nextRole = 'owner';
                    else if (userData.role === 'owner') nextRole = 'member';
                    const roleNames = { 'member': '一般メンバー', 'admin': '管理者', 'owner': 'オーナー' };

                    openActionSheet(`
                        <h3 style="margin-top: 0; font-size: 24px; font-weight: 800; margin-bottom: 20px; color: var(--text-main);">権限の変更</h3>
                        <div class="input-group-card" style="background: rgba(255, 255, 255, 0.8);">
                            <label class="input-label">👤 対象メンバー</label>
                            <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px; padding-left: 5px; color: var(--text-main);">${displayName}</div>
                            <label class="input-label">🔑 新しい権限</label>
                            <div style="font-size: 18px; font-weight: 800; color: var(--accent-color); padding-left: 5px;">${roleNames[nextRole]}</div>
                        </div>
                        <div class="flex-row" style="margin-top: 25px; gap: 15px;">
                            <button class="btn-main" id="confirm-sheet-role" style="flex: 2; margin-bottom: 0;">更新する</button>
                            <button class="btn-sub" id="cancel-sheet-btn" style="flex: 1; margin-bottom: 0;">キャンセル</button>
                        </div>
                    `);
                    document.getElementById('cancel-sheet-btn').onclick = closeActionSheet;
                    document.getElementById('confirm-sheet-role').onclick = async () => {
                        await updateDoc(doc(db, "users", docId), { role: nextRole });
                        closeActionSheet();
                    };
                };

                // ▼ アカウント停止・復旧
                li.querySelector('.btn-toggle-status').onclick = () => {
                    const newStatus = !isActive;
                    const actionText = newStatus ? "復旧（ログイン許可）" : "停止（ログイン禁止）";
                    const themeColor = newStatus ? 'var(--success-color)' : 'var(--danger-color)';

                    openActionSheet(`
                        <h3 style="margin-top: 0; font-size: 24px; font-weight: 800; margin-bottom: 20px; color: var(--text-main);">状態の変更</h3>
                        <div class="input-group-card" style="background: rgba(255, 255, 255, 0.8);">
                            <label class="input-label">👤 対象メンバー</label>
                            <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px; padding-left: 5px; color: var(--text-main);">${displayName}</div>
                            <label class="input-label">⚙️ 新しい状態</label>
                            <div style="font-size: 18px; font-weight: 800; color: ${themeColor}; padding-left: 5px;">${actionText}</div>
                        </div>
                        <div class="flex-row" style="margin-top: 25px; gap: 15px;">
                            <button class="btn-main" id="confirm-sheet-status" style="flex: 2; margin-bottom: 0; ${newStatus ? '' : 'background: linear-gradient(135deg, #ff3b30, #d70015); box-shadow: 0 4px 15px rgba(255, 59, 48, 0.3);'}">${newStatus ? '復旧させる' : '停止する'}</button>
                            <button class="btn-sub" id="cancel-sheet-btn" style="flex: 1; margin-bottom: 0;">キャンセル</button>
                        </div>
                    `);
                    document.getElementById('cancel-sheet-btn').onclick = closeActionSheet;
                    document.getElementById('confirm-sheet-status').onclick = async () => {
                        await updateDoc(doc(db, "users", docId), { isActive: newStatus });
                        closeActionSheet();
                    };
                };

                // ▼ メンバー削除
                li.querySelector('.btn-delete-user').onclick = () => {
                    openActionSheet(`
                        <h3 style="margin-top: 0; font-size: 24px; font-weight: 800; margin-bottom: 20px; color: var(--danger-color);">メンバーの削除</h3>
                        <div class="input-group-card" style="border-color: rgba(255,59,48,0.3); background: rgba(255,59,48,0.05);">
                            <label class="input-label" style="color: var(--danger-color);">👤 対象メンバー</label>
                            <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px; padding-left: 5px; color: var(--text-main);">${displayName}</div>
                            <label class="input-label" style="color: var(--danger-color);">⚠️ 警告</label>
                            <div style="font-size: 13px; font-weight: 700; color: var(--danger-color); padding-left: 5px;">リストから完全に削除します。<br>この操作は取り消せません。</div>
                        </div>
                        <div class="flex-row" style="margin-top: 25px; gap: 15px;">
                            <button class="btn-main" id="confirm-sheet-user-delete" style="flex: 2; margin-bottom: 0; background: linear-gradient(135deg, #ff3b30, #d70015); box-shadow: 0 4px 15px rgba(255, 59, 48, 0.3);">削除する</button>
                            <button class="btn-sub" id="cancel-sheet-btn" style="flex: 1; margin-bottom: 0;">キャンセル</button>
                        </div>
                    `);
                    document.getElementById('cancel-sheet-btn').onclick = closeActionSheet;
                    document.getElementById('confirm-sheet-user-delete').onclick = async () => {
                        await deleteDoc(doc(db, "users", docId));
                        closeActionSheet();
                    };
                };
            }
            userList.appendChild(li);
        });
        // ▼ 追加：リスト更新後も現在の宛先選択を維持する
        if (chatSelect) chatSelect.value = currentChatTarget;
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let userData = {};
        if (userDoc.exists()) {
            userData = userDoc.data();
            if (userData.isActive === false) { await signOut(auth); loginMessage.textContent = "このアカウントは停止されています。"; loginScreen.style.display = 'block'; setTimeout(() => loginScreen.classList.add('active'), 10); appScreen.classList.remove('active'); registerScreen.classList.remove('active'); setTimeout(() => { appScreen.style.display = 'none'; registerScreen.style.display = 'none'; }, 500); return; }
            currentUserRole = userData.role || "member";
        } else {
            currentUserRole = "admin"; setDoc(doc(db, "users", user.uid), { email: user.email, role: currentUserRole, isActive: true, createdAt: new Date() });
        }

        const roleName = currentUserRole === 'owner' ? "👑 オーナー (Owner)" : currentUserRole === 'admin' ? "🏢 管理者 (Admin)" : "👤 一般 (Member)";
        const currentUsername = userData.username || "名無し";
        currentUsernameCache = currentUsername;

        const profileImgUrl = userData.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUsername)}&background=0071e3&color=fff&rounded=true&size=80`;
        currentUserPhotoCache = profileImgUrl;

        document.getElementById('account-info').innerHTML = `<img src="${profileImgUrl}" style="width: 80px; height: 80px; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-radius: 50%; object-fit: cover;"><h2 style="margin: 0; font-size: 24px; letter-spacing: -0.5px;">${currentUsername}</h2><p style="margin: 5px 0 0; color: var(--accent-color); font-weight: 700; font-size: 14px; background: rgba(0,113,227,0.1); padding: 6px 14px; border-radius: 20px;">${roleName}</p>`;
        document.getElementById('profile-username').value = currentUsername;

        appScreen.style.display = 'block'; setTimeout(() => appScreen.classList.add('active'), 10);
        loginScreen.classList.remove('active'); registerScreen.classList.remove('active');
        setTimeout(() => { loginScreen.style.display = 'none'; registerScreen.style.display = 'none'; }, 500);

        loadOrderList(); loadInventory(); loadUsers(); setupUnreadListener();

        document.getElementById('admin-section').style.display = (currentUserRole === 'admin' || currentUserRole === 'owner') ? 'block' : 'none';
        switchTab('list');
    } else {
        loginScreen.style.display = 'block'; setTimeout(() => loginScreen.classList.add('active'), 10);
        appScreen.classList.remove('active'); registerScreen.classList.remove('active');
        setTimeout(() => { appScreen.style.display = 'none'; registerScreen.style.display = 'none'; }, 500);
        currentUserRole = "member"; toggleBtnLoading('login-btn', false);
    }
});

// --- ここから追加：アクションシートを開閉する関数 ---
const sheetOverlay = document.getElementById('action-sheet-overlay');
const sheet = document.getElementById('action-sheet');
const sheetContent = document.getElementById('action-sheet-content');

function openActionSheet(html) {
    sheetContent.innerHTML = html;
    sheetOverlay.style.display = 'block';
    setTimeout(() => {
        sheetOverlay.style.opacity = '1';
        sheet.classList.add('active');
    }, 10);
}

function closeActionSheet() {
    sheet.classList.remove('active');
    sheetOverlay.style.opacity = '0';
    setTimeout(() => {
        sheetOverlay.style.display = 'none';
        sheetContent.innerHTML = '';
    }, 400);
}

document.getElementById('close-sheet').onclick = closeActionSheet;
sheetOverlay.onclick = closeActionSheet;
