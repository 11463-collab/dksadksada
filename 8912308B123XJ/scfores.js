/**
 * scfores.js - Dakon Online Engine
 * Mendukung Multi-Server (AWS & KOR)
 */

// 1. KONFIGURASI DUA SERVER
const SERVERS = {
    AWS: {
        url: 'https://yifnqncmsgbkvvjdgwae.supabase.co',
        key: 'sb_publishable_F47wIask3Ld1QT8Hfvgu-Q_hxHPnYRj'
    },
    KOR: {
        url: 'https://qouaeainjscoidchwtgm.supabase.co',
        key: 'sb_publishable_3O3MN8Kvk__XDfwe5CO_Ug_ux1g33l-'
    }
};

// 2. AMBIL PARAMETER DARI URL
const params = new URLSearchParams(window.location.search);
const myRole = params.get('role'); // 'host' atau 'guest'
const roomID = params.get('room');
const selectedServer = params.get('server') || 'AWS'; // Default ke AWS jika tidak ada

// 3. INISIALISASI CLIENT BERDASARKAN SERVER YANG DIPILIH
const currentConfig = SERVERS[selectedServer] || SERVERS.AWS;
const supabaseClient = window.supabase.createClient(currentConfig.url, currentConfig.key);

class DakonGame {
    constructor() {
        this.board = Array(16).fill(7);
        this.board[7] = 0;  // Lubang besar Host
        this.board[15] = 0; // Lubang besar Guest
        this.currentPlayer = 0; // 1 = Host, 2 = Guest
        this.gameActive = true;
        this.animationRunning = false;
        this.hostName = "Loading...";
        this.guestName = "Loading...";

        this.initGame();
    }

    async initGame() {
        // 1. Ambil Nama & Status awal dari DB (Server yang dipilih)
        const { data, error } = await supabaseClient.from('rooms').select('*').eq('room_id', roomID).single();
        
        if (error || !data || data.status === 'finished') {
            alert("Room tidak tersedia atau sudah berakhir.");
            window.location.href = 'index.html';
            return;
        }

        this.hostName = data.host_name;
        this.guestName = data.guest_name;
        document.getElementById('p1-name').textContent = this.hostName;
        document.getElementById('p2-name').textContent = this.guestName;
        
        // Tampilkan info Room dan Server di UI
        document.getElementById('room-display').innerHTML = `ROOM ID: ${roomID} <b style="color:#764ba2">(${selectedServer})</b>`;

        // 2. Setup Koneksi Internet Monitoring
        this.setupConnectivityListeners();

        // 3. Setup Realtime & Presence
        this.initRealtime();
        
        // 4. Cek apakah sudah suit
        if (data.suit_host && data.suit_guest) {
            this.processSuitResult(data.suit_host, data.suit_guest);
        }

        this.renderBoard();
    }

    setupConnectivityListeners() {
        window.addEventListener('offline', () => {
            this.showNotif("⚠️ Internet Terputus! Cek koneksi Anda.");
            document.getElementById('status').textContent = "OFFLINE";
            document.getElementById('status').style.color = "red";
        });

        window.addEventListener('online', () => {
            this.showNotif("✅ Kembali Online.");
            this.updateUI();
        });
    }

    async initRealtime() {
        const channel = supabaseClient.channel(`room_${roomID}`, {
            config: { presence: { key: myRole } }
        });

        channel
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_id=eq.${roomID}` }, (payload) => {
            const data = payload.new;

            // Jika room di-finish oleh server/lawan
            if (data.status === 'finished' && this.gameActive) {
                this.handleGameEnd("Permainan berakhir atau lawan keluar.");
            }

            // Sync Suit
            if (this.currentPlayer === 0 && data.suit_host && data.suit_guest) {
                this.processSuitResult(data.suit_host, data.suit_guest);
            }

            // Sync Gerakan (Hanya jalankan jika pelakunya BUKAN saya)
            if (data.last_move_by !== myRole && data.last_move !== null) {
                this.makeMove(parseInt(data.last_move), false);
            }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            // Jika lawan meninggalkan room
            if (leftPresences.length > 0) {
                this.finishRoom();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ online_at: new Date().toISOString() });
            }
        });

        this.channel = channel;
    }

    async finishRoom() {
        this.gameActive = false;
        await supabaseClient.from('rooms').update({ status: 'finished' }).eq('room_id', roomID);
        this.handleGameEnd("Lawan terputus. Sesi berakhir.");
    }

    handleGameEnd(msg) {
        this.gameActive = false;
        this.animationRunning = true;
        alert(msg);
        window.location.href = 'https://congklak.benevolentclass.my.id/index';
    }

    processSuitResult(h, g) {
        if (h === g) {
            if (myRole === 'host') this.resetSuitDB();
            document.getElementById('suit-msg').textContent = "Seri! Pilih ulang...";
            Array.from(document.getElementsByClassName('suit-btn')).forEach(b => b.disabled = false);
            return;
        }
        
        let hostWin = (h==='Batu'&&g==='Gunting') || (h==='Gunting'&&g==='Kertas') || (h==='Kertas'&&g==='Batu');
        this.currentPlayer = hostWin ? 1 : 2;
        
        document.getElementById('suit-overlay').classList.add('hidden');
        this.showNotif(hostWin ? `${this.hostName} Jalan Duluan!` : `${this.guestName} Jalan Duluan!`);
        this.updateUI();
        this.renderBoard();
    }

    async resetSuitDB() {
        await supabaseClient.from('rooms').update({ suit_host: null, suit_guest: null }).eq('room_id', roomID);
    }

    // --- LOGIKA PERMAINAN ---

    async makeMove(index, shouldBroadcast) {
        if (this.animationRunning || !this.gameActive) return;
        this.animationRunning = true;

        if (shouldBroadcast) {
            await supabaseClient.from('rooms').update({ 
                last_move: index, 
                last_move_by: myRole,
                updated_at: new Date() 
            }).eq('room_id', roomID);
        }

        let cur = index;
        let seeds = this.board[index];
        this.board[index] = 0;
        this.updateUI();

        while (seeds > 0) {
            await new Promise(r => setTimeout(r, 300));
            cur = (cur + 1) % 16;
            
            // Lewati lubang besar lawan
            if ((this.currentPlayer === 1 && cur === 15) || (this.currentPlayer === 2 && cur === 7)) {
                cur = (cur + 1) % 16;
            }

            this.board[cur]++;
            this.updateUI();
            seeds--;
        }

        // Logika Berhenti di lubang isi
        if (cur !== 7 && cur !== 15 && this.board[cur] > 1) {
            this.animationRunning = false;
            return this.makeMove(cur, false);
        }

        // Logika Nembak
        const isMySide = (this.currentPlayer === 1 && cur <= 6) || (this.currentPlayer === 2 && cur >= 8 && cur <= 14);
        if (isMySide && this.board[cur] === 1) {
            const oppIdx = 14 - cur;
            if (this.board[oppIdx] > 0) {
                const myStore = this.currentPlayer === 1 ? 7 : 15;
                this.board[myStore] += (1 + this.board[oppIdx]);
                this.board[cur] = 0;
                this.board[oppIdx] = 0;
                this.showNotif("🎯 TEMBAK!");
            }
        }

        // Pindah Giliran
        const myStore = this.currentPlayer === 1 ? 7 : 15;
        if (cur !== myStore) {
            this.currentPlayer = 3 - this.currentPlayer;
        } else {
            this.showNotif("✨ BONUS GILIRAN!");
        }

        this.animationRunning = false;
        this.renderBoard();
        this.updateUI();
        this.checkGameOver();
    }

    renderBoard() {
        const container = document.getElementById('board-container');
        container.innerHTML = '';
        const boardEl = document.createElement('div');
        boardEl.className = 'dakon-wood';
        
        boardEl.appendChild(this.createStore(15)); // Guest Store
        
        const pitsGrid = document.createElement('div');
        pitsGrid.className = 'pit-container';
        for(let i = 14; i >= 8; i--) pitsGrid.appendChild(this.createPit(i));
        for(let i = 0; i <= 6; i++) pitsGrid.appendChild(this.createPit(i));
        
        boardEl.appendChild(pitsGrid);
        boardEl.appendChild(this.createStore(7)); // Host Store
        container.appendChild(boardEl);
    }

    createPit(index) {
        const pit = document.createElement('div');
        pit.className = 'pit';
        pit.id = `pit-${index}`;
        pit.textContent = this.board[index];
        
        const isP1Pit = index <= 6;
        const isP2Pit = index >= 8 && index <= 14;

        if (this.gameActive && !this.animationRunning && this.board[index] > 0) {
            if (this.currentPlayer === 1 && isP1Pit && myRole === 'host') {
                pit.classList.add('active-p1');
                pit.onclick = () => this.makeMove(index, true);
            } else if (this.currentPlayer === 2 && isP2Pit && myRole === 'guest') {
                pit.classList.add('active-p2');
                pit.onclick = () => this.makeMove(index, true);
            }
        }
        return pit;
    }

    createStore(index) {
        const store = document.createElement('div');
        store.className = 'store';
        store.id = `pit-${index}`;
        store.textContent = this.board[index];
        return store;
    }

    updateUI() {
        this.board.forEach((val, i) => {
            const el = document.getElementById(`pit-${i}`);
            if (el) el.textContent = val;
        });
        document.getElementById('p1-score').textContent = this.board[7];
        document.getElementById('p2-score').textContent = this.board[15];
        
        const p1Info = document.getElementById('p1-info');
        const p2Info = document.getElementById('p2-info');
        
        p1Info.classList.toggle('current-player', this.currentPlayer === 1);
        p2Info.classList.toggle('current-player', this.currentPlayer === 2);
        
        if (this.currentPlayer !== 0) {
            document.getElementById('status').textContent = "Giliran: " + (this.currentPlayer === 1 ? this.hostName : this.guestName);
            document.getElementById('status').style.color = this.currentPlayer === 1 ? "#6c5ce7" : "#ff7675";
        }
    }

    showNotif(msg) {
        const n = document.getElementById('notif');
        n.textContent = msg; 
        n.style.display = 'block';
        setTimeout(() => n.style.display = 'none', 2500);
    }

    checkGameOver() {
        const p1Empty = this.board.slice(0, 7).every(s => s === 0);
        const p2Empty = this.board.slice(8, 15).every(s => s === 0);
        
        if (p1Empty || p2Empty) {
            this.gameActive = false;
            const hScore = this.board[7];
            const gScore = this.board[15];
            let winner = hScore > gScore ? this.hostName : (gScore > hScore ? this.guestName : "Seri");
            alert(`PERMAINAN SELESAI!\nSkor Akhir:\n${this.hostName}: ${hScore}\n${this.guestName}: ${gScore}\nPemenang: ${winner}`);
            this.finishRoom();
        }
    }
}

// Fungsi Suit Global
async function submitSuit(choice) {
    const col = myRole === 'host' ? 'suit_host' : 'suit_guest';
    document.getElementById('suit-msg').textContent = "Menunggu lawan...";
    Array.from(document.getElementsByClassName('suit-btn')).forEach(b => b.disabled = true);
    
    // Kirim data suit ke server yang sedang aktif
    await supabaseClient.from('rooms').update({ [col]: choice }).eq('room_id', roomID);
}

// Start Game Engine
const game = new DakonGame();
