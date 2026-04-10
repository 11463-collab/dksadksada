/**
 * scfores.js - Dakon Online Engine
 * Mendukung Multi-Server (AWS & KOR)
 */

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

const params = new URLSearchParams(window.location.search);
const myRole = params.get('role'); 
const roomID = params.get('room');
const selectedServer = params.get('server') || 'AWS';

const currentConfig = SERVERS[selectedServer] || SERVERS.AWS;
const supabaseClient = window.supabase.createClient(currentConfig.url, currentConfig.key);

class DakonGame {
    constructor() {
        this.board = Array(16).fill(7);
        this.board[7] = 0;  
        this.board[15] = 0; 
        this.currentPlayer = 0; 
        this.gameActive = true;
        this.animationRunning = false;
        this.hostName = "Loading...";
        this.guestName = "Loading...";

        this.initGame();
    }

    async initGame() {
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
        
        document.getElementById('room-display').innerHTML = `ROOM ID: ${roomID} <b style="color:#764ba2">(${selectedServer})</b>`;

        this.setupConnectivityListeners();
        this.initRealtime();
        
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
            if (data.status === 'finished' && this.gameActive) {
                this.checkGameOver(); // Trigger UI End Game
            }
            if (this.currentPlayer === 0 && data.suit_host && data.suit_guest) {
                this.processSuitResult(data.suit_host, data.suit_guest);
            }
            if (data.last_move_by !== myRole && data.last_move !== null) {
                this.makeMove(parseInt(data.last_move), false);
            }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            if (leftPresences.length > 0 && this.gameActive) {
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
        this.checkGameOver();
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
            if ((this.currentPlayer === 1 && cur === 15) || (this.currentPlayer === 2 && cur === 7)) {
                cur = (cur + 1) % 16;
            }
            this.board[cur]++;
            this.updateUI();
            seeds--;
        }

        if (cur !== 7 && cur !== 15 && this.board[cur] > 1) {
            this.animationRunning = false;
            return this.makeMove(cur, false);
        }

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
        boardEl.appendChild(this.createStore(15)); 
        const pitsGrid = document.createElement('div');
        pitsGrid.className = 'pit-container';
        for(let i = 14; i >= 8; i--) pitsGrid.appendChild(this.createPit(i));
        for(let i = 0; i <= 6; i++) pitsGrid.appendChild(this.createPit(i));
        boardEl.appendChild(pitsGrid);
        boardEl.appendChild(this.createStore(7)); 
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
        
        if (p1Empty || p2Empty || !this.gameActive) {
            this.gameActive = false;
            const hScore = this.board[7];
            const gScore = this.board[15];
            
            let winnerText = "";
            let iconHtml = "";
            let statusText = "GAME OVER";

            if (hScore > gScore) {
                winnerText = this.hostName + " Menang!";
                iconHtml = myRole === 'host' ? '<i class="fas fa-trophy" style="color:#f1c40f"></i>' : '<i class="fas fa-heart-broken" style="color:#e74c3c"></i>';
                statusText = myRole === 'host' ? "SELAMAT! 🎉" : "COBA LAGI... 😅";
            } else if (gScore > hScore) {
                winnerText = this.guestName + " Menang!";
                iconHtml = myRole === 'guest' ? '<i class="fas fa-trophy" style="color:#f1c40f"></i>' : '<i class="fas fa-heart-broken" style="color:#e74c3c"></i>';
                statusText = myRole === 'guest' ? "SELAMAT! 🎉" : "COBA LAGI... 😅";
            } else {
                winnerText = "Hasil Seri!";
                iconHtml = '<i class="fas fa-handshake" style="color:#3498db"></i>';
                statusText = "SAMA KUAT!";
            }

            document.getElementById('winner-icon').innerHTML = iconHtml;
            document.getElementById('winner-status').textContent = statusText;
            document.getElementById('winner-name').textContent = winnerText;
            document.getElementById('res-p1-name').textContent = this.hostName;
            document.getElementById('res-p1-score').textContent = hScore;
            document.getElementById('res-p2-name').textContent = this.guestName;
            document.getElementById('res-p2-score').textContent = gScore;

            document.getElementById('game-over-overlay').classList.remove('hidden');
        }
    }
}

async function submitSuit(choice) {
    const col = myRole === 'host' ? 'suit_host' : 'suit_guest';
    document.getElementById('suit-msg').textContent = "Menunggu lawan...";
    Array.from(document.getElementsByClassName('suit-btn')).forEach(b => b.disabled = true);
    await supabaseClient.from('rooms').update({ [col]: choice }).eq('room_id', roomID);
}

const game = new DakonGame();
