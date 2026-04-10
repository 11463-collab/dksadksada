/**
 * scfores.js - Dakon Online Engine Optimized
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
        this.lastProcessedMoveId = null; // Menghindari move ganda

        this.initGame();
    }

    async initGame() {
        const { data, error } = await supabaseClient.from('rooms').select('*').eq('room_id', roomID).single();
        if (error || !data) {
            alert("Room tidak ditemukan.");
            window.location.href = 'index.html';
            return;
        }

        this.hostName = data.host_name;
        this.guestName = data.guest_name;
        document.getElementById('p1-name').textContent = this.hostName;
        document.getElementById('p2-name').textContent = this.guestName;
        document.getElementById('room-display').innerHTML = `ROOM: ${roomID} <b>(${selectedServer})</b>`;

        this.initRealtime();
        if (data.suit_host && data.suit_guest) this.processSuitResult(data.suit_host, data.suit_guest);
        this.renderBoard();
    }

    async initRealtime() {
        const channel = supabaseClient.channel(`room_${roomID}`);
        channel
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_id=eq.${roomID}` }, (payload) => {
            const data = payload.new;

            // 1. Cek Game Over
            if (data.status === 'finished' && this.gameActive) {
                this.gameActive = false;
                this.checkGameOver();
            }

            // 2. Sinkronisasi Suit
            if (this.currentPlayer === 0 && data.suit_host && data.suit_guest) {
                this.processSuitResult(data.suit_host, data.suit_guest);
            }

            // 3. Sinkronisasi Gerakan Lawan
            // Kita gunakan timestamp atau pengecekan role untuk memastikan ini gerakan baru dari lawan
            if (data.last_move_by !== myRole && data.last_move !== null) {
                const moveKey = `${data.last_move}_${data.updated_at}`;
                if (this.lastProcessedMoveId !== moveKey) {
                    this.lastProcessedMoveId = moveKey;
                    this.makeMove(parseInt(data.last_move), false);
                }
            }
        })
        .subscribe();
    }

    async processSuitResult(h, g) {
        if (h === g) {
            document.getElementById('suit-msg').textContent = "Seri! Pilih ulang...";
            const btns = document.getElementsByClassName('suit-btn');
            for(let b of btns) b.disabled = false;
            if (myRole === 'host') await supabaseClient.from('rooms').update({ suit_host: null, suit_guest: null }).eq('room_id', roomID);
            return;
        }
        
        const hostWin = (h==='Batu'&&g==='Gunting') || (h==='Gunting'&&g==='Kertas') || (h==='Kertas'&&g==='Batu');
        this.currentPlayer = hostWin ? 1 : 2;
        
        const overlay = document.getElementById('suit-overlay');
        overlay.style.opacity = '0';
        setTimeout(() => overlay.classList.add('hidden'), 300);
        
        this.showNotif(this.currentPlayer === 1 ? `${this.hostName} Jalan!` : `${this.guestName} Jalan!`);
        this.updateUI();
        this.renderBoard();
    }

    async makeMove(index, shouldBroadcast) {
        if (this.animationRunning || !this.gameActive) return;
        this.animationRunning = true;

        if (shouldBroadcast) {
            await supabaseClient.from('rooms').update({ 
                last_move: index, 
                last_move_by: myRole,
                updated_at: new Date().toISOString() 
            }).eq('room_id', roomID);
        }

        let cur = index;
        let seeds = this.board[index];
        this.board[index] = 0;
        this.updateUI();

        while (seeds > 0) {
            await new Promise(r => setTimeout(r, 250));
            cur = (cur + 1) % 16;
            if ((this.currentPlayer === 1 && cur === 15) || (this.currentPlayer === 2 && cur === 7)) cur = (cur + 1) % 16;
            this.board[cur]++;
            this.updateUI();
            seeds--;
        }

        // Logic Berhenti di lubang isi
        if (cur !== 7 && cur !== 15 && this.board[cur] > 1) {
            this.animationRunning = false;
            return this.makeMove(cur, false);
        }

        // Logic Nembak
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
        
        boardEl.appendChild(this.createStore(15)); // Guest
        const pitsGrid = document.createElement('div');
        pitsGrid.className = 'pit-container';
        for(let i = 14; i >= 8; i--) pitsGrid.appendChild(this.createPit(i));
        for(let i = 0; i <= 6; i++) pitsGrid.appendChild(this.createPit(i));
        boardEl.appendChild(pitsGrid);
        boardEl.appendChild(this.createStore(7)); // Host
        
        container.appendChild(boardEl);
    }

    createPit(index) {
        const pit = document.createElement('div');
        pit.className = 'pit';
        pit.id = `pit-${index}`;
        pit.textContent = this.board[index];
        
        const isMyTurn = (this.currentPlayer === 1 && myRole === 'host') || (this.currentPlayer === 2 && myRole === 'guest');
        const isMyPit = (myRole === 'host' && index <= 6) || (myRole === 'guest' && index >= 8 && index <= 14);

        if (this.gameActive && isMyTurn && isMyPit && this.board[index] > 0) {
            pit.classList.add(myRole === 'host' ? 'active-p1' : 'active-p2');
            pit.onclick = () => this.makeMove(index, true);
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
        
        document.getElementById('p1-info').classList.toggle('current-player', this.currentPlayer === 1);
        document.getElementById('p2-info').classList.toggle('current-player', this.currentPlayer === 2);
        
        if (this.currentPlayer !== 0) {
            const statusEl = document.getElementById('status');
            statusEl.textContent = "Giliran: " + (this.currentPlayer === 1 ? this.hostName : this.guestName);
            statusEl.style.color = this.currentPlayer === 1 ? "#6c5ce7" : "#ff7675";
        }
    }

    showNotif(msg) {
        const n = document.getElementById('notif');
        n.textContent = msg; 
        n.style.display = 'block';
        setTimeout(() => n.style.display = 'none', 2000);
    }

    async checkGameOver() {
        const p1Empty = this.board.slice(0, 7).every(s => s === 0);
        const p2Empty = this.board.slice(8, 15).every(s => s === 0);
        
        if (p1Empty || p2Empty || !this.gameActive) {
            this.gameActive = false;
            const hScore = this.board[7];
            const gScore = this.board[15];
            
            let icon = '<i class="fas fa-handshake" style="color:#3498db"></i>';
            let status = "HASIL SERI";
            let winner = "Sama Kuat!";

            if (hScore !== gScore) {
                const hostWin = hScore > gScore;
                const iWin = (hostWin && myRole === 'host') || (!hostWin && myRole === 'guest');
                icon = iWin ? '<i class="fas fa-trophy" style="color:#f1c40f"></i>' : '<i class="fas fa-heart-broken" style="color:#e74c3c"></i>';
                status = iWin ? "KAMU MENANG!" : "KAMU KALAH!";
                winner = hostWin ? this.hostName : this.guestName;
                winner += " Pemenangnya!";
            }

            document.getElementById('winner-icon').innerHTML = icon;
            document.getElementById('winner-status').textContent = status;
            document.getElementById('winner-name').textContent = winner;
            document.getElementById('res-p1-score').textContent = hScore;
            document.getElementById('res-p2-score').textContent = gScore;
            document.getElementById('game-over-overlay').classList.remove('hidden');

            if (myRole === 'host') await supabaseClient.from('rooms').update({ status: 'finished' }).eq('room_id', roomID);
        }
    }
}

async function submitSuit(choice) {
    const col = myRole === 'host' ? 'suit_host' : 'suit_guest';
    document.getElementById('suit-msg').textContent = "Menunggu lawan...";
    const btns = document.getElementsByClassName('suit-btn');
    for(let b of btns) b.disabled = true;
    await supabaseClient.from('rooms').update({ [col]: choice }).eq('room_id', roomID);
}

const game = new DakonGame();
