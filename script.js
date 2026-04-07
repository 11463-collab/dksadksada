// 1. Data & State
let currentUser = {
    name: "Player_" + Math.floor(Math.random() * 1000),
    avatar: ""
};

let activeServers = [
    { name: "Pro Player Only", isPrivate: false, host: "Budi", hostAvatar: "Budi" },
    { name: "Latihan Bareng", isPrivate: true, host: "Santi", hostAvatar: "Santi" },
    { name: "Dakon Santai", isPrivate: false, host: "Affan", hostAvatar: "Affan" }
];

// 2. Fungsi Profil
function updateProfileUI() {
    currentUser.avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.name}`;
    document.getElementById('my-avatar').src = currentUser.avatar;
    document.getElementById('my-name-display').textContent = currentUser.name;
}

function editProfile() {
    const newName = prompt("Masukkan Nama Kamu:", currentUser.name);
    if (newName) {
        currentUser.name = newName;
        updateProfileUI();
    }
}

// 3. Manajemen Server List
function togglePassInput() {
    const select = document.getElementById('pass-toggle');
    const passContainer = document.getElementById('pass-input-container');
    passContainer.classList.toggle('hidden', select.value === 'public');
}

function renderServerList() {
    const listContainer = document.getElementById('server-list');
    listContainer.innerHTML = '';

    activeServers.forEach((server, index) => {
        const item = document.createElement('div');
        item.className = 'server-item';
        item.innerHTML = `
            <div class="server-info">
                <div style="display:flex; align-items:center; gap:10px">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${server.hostAvatar}" class="avatar-sm">
                    <div>
                        <h4>${server.name}</h4>
                        <span>Host: ${server.host}</span>
                    </div>
                </div>
                <span class="tag ${server.isPrivate ? 'tag-private' : 'tag-public'}">
                    ${server.isPrivate ? '🔒 Private' : '🔓 Public'}
                </span>
            </div>
            <button class="btn-outline" onclick="joinServer(${index})">Join</button>
        `;
        listContainer.appendChild(item);
    });
}

// 4. Alur Masuk Game (Enter Game)
function handleCreateServer() {
    const name = document.getElementById('new-room-name').value;
    const isPrivate = document.getElementById('pass-toggle').value === 'private';
    const pass = document.getElementById('new-room-pass').value;

    if (!name) return alert("Beri nama server Anda!");
    if (isPrivate && !pass) return alert("Masukkan password untuk server privat!");

    enterGame(name, 'host');
}

function joinServer(index) {
    const server = activeServers[index];
    if (server.isPrivate) {
        const input = prompt("Masukkan Password Server:");
        if (input !== "1234") return alert("Password Salah!");
    }
    enterGame(server.name, 'guest', server);
}

function enterGame(roomName, role, serverData = null) {
    // Pindah Halaman
    document.getElementById('lobby-page').classList.add('hidden');
    document.getElementById('game-page').classList.remove('hidden');
    document.getElementById('active-room-display').textContent = roomName;

    const hostControls = document.getElementById('host-controls');
    
    if (role === 'host') {
        // Jika Anda Host
        document.getElementById('p1-name').textContent = currentUser.name;
        document.getElementById('p1-img').src = currentUser.avatar;
        document.getElementById('p2-name').textContent = "Menunggu lawan...";
        document.getElementById('p2-img').src = "https://api.dicebear.com/7.x/avataaars/svg?seed=empty";
        
        hostControls.classList.remove('hidden'); // Munculkan tombol Start
        game.gameActive = false; // Kunci board
        game.showNotification("Server Aktif. Menunggu lawan bergabung...", "info");
    } else {
        // Jika Anda Tamu (Guest)
        document.getElementById('p1-name').textContent = serverData.host;
        document.getElementById('p1-img').src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${serverData.hostAvatar}`;
        document.getElementById('p2-name').textContent = currentUser.name;
        document.getElementById('p2-img').src = currentUser.avatar;
        
        hostControls.classList.add('hidden'); // Sembunyikan tombol Start
        game.gameActive = false;
        game.showNotification("Berhasil Gabung! Menunggu Host memulai...", "success");
    }

    game.newGame(); // Reset papan
}

// 5. Kontrol Permainan
function broadcastStartGame() {
    game.gameActive = true;
    document.getElementById('host-controls').classList.add('hidden');
    game.showNotification("Game Dimulai! Giliran Player 1", "success");
    game.renderBoard();
}

function exitToLobby() {
    if(confirm("Keluar dari permainan?")) {
        document.getElementById('game-page').classList.add('hidden');
        document.getElementById('lobby-page').classList.remove('hidden');
    }
}

// Init
window.addEventListener('load', () => {
    updateProfileUI();
    renderServerList();
});