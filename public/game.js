const socket = io();
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomInput = document.getElementById('room-code');
const statusMsg = document.getElementById('status-msg');
const menu = document.getElementById('menu');
const waitingScreen = document.getElementById('waiting-screen');
const displayRoomCode = document.getElementById('display-room-code');
const scoreElem = document.getElementById('my-score');
const soloBtn = document.getElementById('solo-btn');

// Remote Waiting Elements
const remoteWaitingScreen = document.getElementById('remote-waiting-screen');
const remoteRoomName = document.getElementById('remote-room-name');
const remoteRoomCode = document.getElementById('remote-room-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const remoteBackBtn = document.getElementById('remote-back-btn');

// Menu Navigation Elements
const menuMain = document.getElementById('menu-main');
const menuCreate = document.getElementById('menu-create');
const menuJoin = document.getElementById('menu-join');
const mainLayout = document.querySelector('.main-layout-container');

const btnShowCreate = document.getElementById('btn-show-create');
const btnShowJoin = document.getElementById('btn-show-join');
const createConfirmBtn = document.getElementById('create-confirm-btn');
const joinConfirmBtn = document.getElementById('join-confirm-btn');
const backToMainFromCreate = document.getElementById('back-to-main-from-create');
const backToMainFromJoin = document.getElementById('back-to-main-from-join');

// Identity & Ranking & History
const playerIdentityInput = document.getElementById('player-identity');
const rankingBtn = document.getElementById('ranking-btn');
const rankingModal = document.getElementById('ranking-modal');
const closeRankingBtn = document.getElementById('close-ranking');
const rankingList = document.getElementById('ranking-list');

const historyBtn = document.getElementById('history-btn');
const historyModal = document.getElementById('history-modal');
const closeHistoryBtn = document.getElementById('close-history');
const historyList = document.getElementById('history-list');

// Welcome / Nickname UI
const nicknameInputGroup = document.getElementById('nickname-input-group');
const welcomeContainer = document.getElementById('welcome-container');
const welcomeNickname = document.getElementById('welcome-nickname');
const changeNickBtn = document.getElementById('change-nick-btn');

// Supabase Config
// TODO: USER MUST REPLACE THIS URL WITH THEIR ACTUAL SUPABASE PROJECT URL
const SUPABASE_URL = 'https://jqyydhlsqkdfbvldyxbv.supabase.co';
// Using the provided Publishable API Key
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxeXlkaGxzcWtkZmJ2bGR5eGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNTQyMzUsImV4cCI6MjA4NTgzMDIzNX0.SG_hG4WSBYIf27nOvhk4KIyctcSmzeg8QemO3FA0d5M';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    try {
        // If the user provided a secret that actually acts as a key (self-hosted?), we try it.
        // But usually we need the URL.
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase initialized (verify URL/Key in game.js if it fails)");
    } catch (e) {
        console.error("Supabase init failed:", e);
    }
}

// Nickname Management
let currentPlayerName = '';

function loadNickname() {
    const storedNick = localStorage.getItem('pong2_nickname');
    if (storedNick) {
        currentPlayerName = storedNick;
        showWelcome(storedNick);
        playerIdentityInput.value = storedNick;
    } else {
        showInput();
    }
}

function saveNickname(name) {
    if (!name) return;
    localStorage.setItem('pong2_nickname', name);
    currentPlayerName = name;
    showWelcome(name);
}

function showWelcome(name) {
    if (nicknameInputGroup) nicknameInputGroup.classList.add('hidden');
    if (welcomeContainer) welcomeContainer.classList.remove('hidden');
    if (welcomeNickname) welcomeNickname.innerText = name;
}

function showInput() {
    if (nicknameInputGroup) nicknameInputGroup.classList.remove('hidden');
    if (welcomeContainer) welcomeContainer.classList.add('hidden');
    if (playerIdentityInput) playerIdentityInput.value = '';
    setTimeout(() => playerIdentityInput.focus(), 100);
}

if (changeNickBtn) {
    changeNickBtn.addEventListener('click', () => {
        showInput();
    });
}

// Initial Load
loadNickname();

let mySide = null; // 'bottom' or 'top'
let roomId = null;
let gameState = null;
let lastBallDx = 0;
let lastBallDy = 0;
let lastP1Score = 0;
let lastP2Score = 0;
let isSoloMode = false;
let isRemoteMode = false; // New flag for full-court view
let soloInterval = null;

// Audio System (8-bit style)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(freq, type, duration, volume = 0.1) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

const SFX = {
    hit: () => playSound(440, 'square', 0.1),
    wall: () => playSound(330, 'square', 0.08),
    score: () => {
        playSound(523, 'square', 0.2);
        setTimeout(() => playSound(659, 'square', 0.4), 100);
    },
    powerup: () => {
        playSound(880, 'sine', 0.1);
        setTimeout(() => playSound(1320, 'sine', 0.2), 50);
    }
};

function triggerVibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const customRoomNameInput = document.getElementById('custom-room-name');
const roomsList = document.getElementById('rooms-list');
const roomsListContainer = document.getElementById('rooms-list-container');

// UI Handlers
// Navigation Handlers
btnShowCreate.addEventListener('click', () => {
    menuMain.classList.add('hidden');
    menuCreate.classList.remove('hidden');
});

btnShowJoin.addEventListener('click', () => {
    menuMain.classList.add('hidden');
    menuJoin.classList.remove('hidden');
    socket.emit('get_rooms'); // Refresh rooms when opening
});

backToMainFromCreate.addEventListener('click', () => {
    menuCreate.classList.add('hidden');
    menuMain.classList.remove('hidden');
});

backToMainFromJoin.addEventListener('click', () => {
    menuJoin.classList.add('hidden');
    menuMain.classList.remove('hidden');
});


// Action Handlers
createConfirmBtn.addEventListener('click', () => {
    const roomName = customRoomNameInput.value.trim();
    const mode = document.querySelector('input[name="game-mode"]:checked').value;

    // Use input value if visible, otherwise current stored name
    let playerNameInput = playerIdentityInput.value.trim();
    if (!nicknameInputGroup.classList.contains('hidden')) {
        // Input is visible, use it and save it
        if (playerNameInput) saveNickname(playerNameInput);
    }

    // Fallback
    const playerName = playerNameInput || currentPlayerName || 'JOGADOR 1';

    // Ensure we save it if it wasn't saved yet
    if (playerName && playerName !== currentPlayerName) saveNickname(playerName);

    // FORÇAR MODO REMOTO NA VARIÁVEL LOCAL (ou nearby se escolhido)
    isRemoteMode = (mode === 'remote');

    socket.emit('create_game', { roomName, mode, playerName });
});

joinConfirmBtn.addEventListener('click', () => {
    const code = roomInput.value.trim();

    let playerNameInput = playerIdentityInput.value.trim();
    if (!nicknameInputGroup.classList.contains('hidden')) {
        if (playerNameInput) saveNickname(playerNameInput);
    }
    const playerName = playerNameInput || currentPlayerName || 'JOGADOR 2';

    if (code) {
        // We assume remote/spectate mainly for code join
        isRemoteMode = true;
        socket.emit('join_game', { roomId: code, playerName });
    }
});

socket.on('rooms_update', (rooms) => {
    if (rooms.length === 0) {
        roomsListContainer.classList.add('hidden');
        return;
    }

    roomsListContainer.classList.remove('hidden');
    roomsList.innerHTML = '';

    rooms.forEach(room => {
        const roomElem = document.createElement('div');
        roomElem.className = 'room-item';

        const isFull = room.playerCount >= 2;
        const actionText = isFull ? 'ASSISTIR' : 'ENTRAR';
        const statusClass = isFull ? 'spectate' : 'join';

        roomElem.innerHTML = `
            <span class="room-name">${room.name}</span>
            <span class="room-status ${statusClass}">${actionText}</span>
        `;
        roomElem.addEventListener('click', () => {
            isRemoteMode = true; // Joining via list is remote mode

            let playerNameInput = playerIdentityInput.value.trim();
            if (!nicknameInputGroup.classList.contains('hidden')) {
                if (playerNameInput) saveNickname(playerNameInput);
            }
            const playerName = playerNameInput || currentPlayerName || 'JOGADOR 2';

            socket.emit('join_game', { roomId: room.id, playerName });
        });
        roomsList.appendChild(roomElem);
    });
});

soloBtn.addEventListener('click', (e) => {
    e.preventDefault();
    startSoloMode();
});

// New Record Elements
const newRecordModal = document.getElementById('new-record-modal');
const newRecordValue = document.getElementById('new-record-value');
const recordPlayerName = document.getElementById('record-player-name');
const closeRecordBtn = document.getElementById('close-record-btn');

let currentBestScore = 0;
let isRecordModalOpen = false;

if (closeRecordBtn) {
    closeRecordBtn.addEventListener('click', () => {
        newRecordModal.classList.add('hidden');
        isRecordModalOpen = false;
        // Reset ball immediately on close to avoid instant death if logic was paused weirdly
        if (gameState && gameState.ball) {
            gameState.ball.y = 50;
            gameState.ball.dy = 0.5;
        }
        startSoloLoop(); // Restart loop
    });
}

function startSoloMode() {
    isSoloMode = true;
    mySide = 'bottom';
    if (mainLayout) mainLayout.classList.add('hidden');

    const scoreContainer = document.getElementById('score-container');
    scoreContainer.classList.remove('hidden');
    scoreContainer.classList.add('solo-mode');

    // Initialize local game state
    gameState = {
        players: {
            'solo': { side: 'bottom', x: 50, score: 0, width: 20 }
        },
        ball: { x: 50, y: 50, dx: 0.5, dy: 0.5 },
        status: 'playing'
    };

    lastP1Score = 0;
    scoreElem.innerText = "0";

    // Stop socket just in case
    socket.disconnect();

    // Fetch previous best
    const name = currentPlayerName || 'ANÔNIMO';
    fetchPersonalBest(name);

    startSoloLoop();
}

async function fetchPersonalBest(name) {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('solo_scores')
            .select('score')
            .eq('name', name)
            .order('score', { ascending: false })
            .limit(1);

        if (error) {
            console.error("Error fetching request:", error);
            return;
        }

        if (data && data.length > 0) {
            currentBestScore = data[0].score;
            console.log("Current Best:", currentBestScore);
        } else {
            currentBestScore = 0;
        }
    } catch (e) {
        console.error("Fetch best ex:", e);
    }
}

function startSoloLoop() {
    if (soloInterval) clearInterval(soloInterval);

    let speedMultiplier = 1.0;
    let lastSpeedUpdate = Date.now();

    soloInterval = setInterval(() => {
        if (!isSoloMode) {
            clearInterval(soloInterval);
            return;
        }

        // Pause if modal is open
        if (isRecordModalOpen) return;

        // Increase speed
        if (Date.now() - lastSpeedUpdate > 5000) {
            speedMultiplier += 0.05;
            lastSpeedUpdate = Date.now();
        }

        const ball = gameState.ball;
        const prevBallY = ball.y;

        // Move Ball
        ball.x += ball.dx * speedMultiplier;
        ball.y += ball.dy * speedMultiplier;

        // Wall Collisions
        if (ball.x <= 2 || ball.x >= 98) {
            ball.dx *= -1;
        }

        // Ceiling Collision
        if (ball.y >= 98) {
            ball.y = 98;
            ball.dy *= -1;
            SFX.hit();
            triggerVibrate(15);
        }

        // Paddle Collision
        const player = gameState.players['solo'];
        const pWidthHalf = (player.width || 20) / 2;

        if (ball.dy < 0 && prevBallY >= 5 && ball.y <= 7) {
            if (Math.abs(ball.x - player.x) < pWidthHalf + 2) {
                ball.y = 7;
                ball.dy *= -1;
                ball.dx *= 1.05;
                ball.dy *= 1.05;
                const hitOffset = (ball.x - player.x) / pWidthHalf;
                ball.dx += hitOffset * 0.5;

                SFX.hit();
                triggerVibrate(30);

                player.score += 1;
                scoreElem.innerText = player.score;
            }
        }

        // Death
        if (ball.y < -5) {
            triggerVibrate(200);

            // Check Record Logic
            if (player.score > currentBestScore && player.score > 0) {
                // NEW RECORD!
                currentBestScore = player.score;

                // Show Modal
                isRecordModalOpen = true;
                newRecordValue.innerText = currentBestScore;
                recordPlayerName.innerText = currentPlayerName || 'JOGADOR';
                newRecordModal.classList.remove('hidden');
                SFX.powerup(); // Victory sound
            }

            // SAVE SCORE logic
            if (player.score > 0) {
                const nameToSave = currentPlayerName || 'ANÔNIMO';
                saveSoloScore(nameToSave, player.score);
            }

            // Reset ball
            ball.x = 50;
            ball.y = 50;
            ball.dx = (Math.random() > 0.5 ? 1 : -1) * 0.5;
            ball.dy = 0.5;

            // If modal is open, we don't reset vars yet, wait for continue
            // But we do need to reset score for next round
            player.score = 0;
            scoreElem.innerText = "0";

            lastBallDx = ball.dx;
            lastBallDy = ball.dy;
            speedMultiplier = 1.0;
            lastSpeedUpdate = Date.now();
        }

    }, 1000 / 60);
}

// Socket Events
socket.on('game_created', (data) => {
    roomId = data.roomId;
    mySide = data.side;
    isRemoteMode = (data.mode === 'remote');
    console.log("Room created! Mode:", data.mode);

    // Hide all menu sub-views
    menuMain.classList.add('hidden');
    menuCreate.classList.add('hidden');
    menuJoin.classList.add('hidden');
    if (mainLayout) mainLayout.classList.add('hidden');

    if (isRemoteMode) {
        // Show Remote Waiting Screen
        remoteWaitingScreen.classList.remove('hidden');
        remoteRoomName.innerText = data.roomName || "SALA SEM NOME";
        remoteRoomCode.innerText = roomId;
    } else {
        // Show Nearby Waiting Screen
        waitingScreen.classList.remove('hidden');
        displayRoomCode.innerText = roomId;

        // Generate QR Code for nearby mode
        const joinUrl = `${window.location.protocol}//${window.location.host}/?room=${roomId}`;
        document.getElementById('qrcode').innerHTML = ""; // Clear previous
        new QRCode(document.getElementById("qrcode"), {
            text: joinUrl,
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L
        });
    }
});

socket.on('game_joined', (data) => {
    roomId = data.roomId;
    mySide = data.side;
    isRemoteMode = (data.mode === 'remote'); // Force remote mode if joining remote room

    if (data.role === 'spectator') {
        console.log("Joined as Spectator");
        statusMsg.innerText = "VOCÊ ESTÁ ASSISTINDO A PARTIDA";
        isRemoteMode = true; // Spectators always see full arena
    }

    // Start immediately
    menuMain.classList.add('hidden');
    menuCreate.classList.add('hidden');
    menuJoin.classList.add('hidden');
    if (mainLayout) mainLayout.classList.add('hidden');

    waitingScreen.classList.add('hidden');
    remoteWaitingScreen.classList.add('hidden');

    // As spectator, we might jump straight to game view if game is running
});

// Auto-Join if room param exists
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
    roomInput.value = roomParam;
    socket.emit('join_game', roomParam);
}

// Back Buttons
const backBtn = document.getElementById('back-btn');

function handleBack(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    console.log("Back button activated!");

    // Soft Reset UI
    waitingScreen.classList.add('hidden');
    remoteWaitingScreen.classList.add('hidden');
    document.getElementById('score-container').classList.add('hidden');
    document.getElementById('score-container').classList.remove('solo-mode');

    // Show Main Menu, Reset Sub Menus
    menuMain.classList.remove('hidden');
    menuCreate.classList.add('hidden');
    menuJoin.classList.add('hidden');
    if (mainLayout) mainLayout.classList.remove('hidden');

    // Clear Local State
    roomId = null;
    gameState = null;
    mySide = null;
    isSoloMode = false;
    if (soloInterval) clearInterval(soloInterval);

    // Reset Socket
    setTimeout(() => {
        socket.disconnect();
        socket.connect();
    }, 50);
}

backBtn.addEventListener('click', handleBack);
backBtn.addEventListener('touchstart', handleBack, { passive: false });
remoteBackBtn.addEventListener('click', handleBack);

// Copy Code Logic
copyCodeBtn.addEventListener('click', () => {
    const code = remoteRoomCode.innerText;
    navigator.clipboard.writeText(code).then(() => {
        const originalText = copyCodeBtn.innerText;
        copyCodeBtn.innerText = "COPIADO!";
        copyCodeBtn.style.background = "var(--fg)";
        copyCodeBtn.style.color = "var(--bg)";
        setTimeout(() => {
            copyCodeBtn.innerText = originalText;
            copyCodeBtn.style.background = "";
            copyCodeBtn.style.color = "";
        }, 2000);
    });
});

// QR Scanner Logic
const scanBtn = document.getElementById('scan-btn');
const scannerModal = document.getElementById('scanner-modal');
const closeScannerBtn = document.getElementById('close-scanner');
let html5QrCode;
let isScanning = false;

scanBtn.addEventListener('click', () => {
    if (isScanning) return;
    scannerModal.classList.remove('hidden');
    isScanning = true;

    // Initialize Scanner with improved settings
    html5QrCode = new Html5Qrcode("reader");

    const config = {
        fps: 20, // Higher FPS for smoother feel
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText, decodedResult) => {
            // Success - give a tiny vibration feedback if supported
            if (navigator.vibrate) navigator.vibrate(50);

            console.log(`Code scanned = ${decodedText}`);

            let code = decodedText;
            try {
                const url = new URL(decodedText);
                const room = url.searchParams.get('room');
                if (room) code = room;
            } catch (e) { }

            roomInput.value = code;
            isRemoteMode = false; // Scanning QR is always nearby/split-screen mode

            const playerName = currentPlayerName || 'JOGADOR 2'; // Assume stored if scanning
            socket.emit('join_game', { roomId: code, playerName });
            stopScanner();
        },
        (errorMessage) => {
            // Quietly ignore parse errors
        }
    ).then(() => {
        // Apply Initial Zoom (if supported)
        try {
            const capabilities = html5QrCode.getRunningTrackCapabilities();
            if (capabilities.zoom) {
                const min = capabilities.zoom.min;
                const max = capabilities.zoom.max;
                // Apply a moderate zoom (25% of the range or 2x if possible)
                const targetZoom = Math.min(max, min + (max - min) * 0.25);
                html5QrCode.applyVideoConstraints({
                    advanced: [{ zoom: targetZoom }]
                });
                console.log("Initial zoom applied:", targetZoom);
            }
        } catch (e) {
            console.warn("Zoom capability check failed:", e);
        }

        // Tap to Focus logic
        const readerElem = document.getElementById('reader');
        readerElem.style.cursor = 'crosshair';
        readerElem.onclick = () => {
            try {
                const capabilities = html5QrCode.getRunningTrackCapabilities();
                const settings = { advanced: [] };

                // Many browsers trigger autofocus when constraints are re-applied
                // We attempt to set focusMode to continuous or single-shot
                if (capabilities.focusMode) {
                    if (capabilities.focusMode.includes('continuous')) {
                        settings.advanced.push({ focusMode: 'continuous' });
                    } else if (capabilities.focusMode.includes('single-shot')) {
                        settings.advanced.push({ focusMode: 'single-shot' });
                    }
                }

                // If zoom is supported, keep the current zoom in the constraints
                const currentSettings = html5QrCode.getRunningTrackSettings();
                if (currentSettings.zoom) {
                    settings.advanced.push({ zoom: currentSettings.zoom });
                }

                html5QrCode.applyVideoConstraints(settings);

                // Visual feedback for focus
                const overlay = document.querySelector('.scanner-overlay');
                overlay.style.borderColor = 'rgba(255,255,255,0.8)';
                setTimeout(() => overlay.style.borderColor = '', 200);

                console.log("Focus triggered by tap");
            } catch (e) {
                console.warn("Focus trigger failed:", e);
            }
        };
    }).catch(err => {
        console.error("Camera error:", err);
        alert("Erro na câmera: Certifique-se de dar permissão ou tente usar outro navegador.");
        stopScanner();
    });
});

closeScannerBtn.addEventListener('click', () => {
    console.log("Close scanner clicked");
    stopScanner();
});

closeScannerBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    console.log("Close scanner touched");
    stopScanner();
}, { passive: false });

function stopScanner() {
    console.log("Stopping scanner...");
    isScanning = false;
    if (html5QrCode) {
        // Force stop if it's running
        html5QrCode.stop().then(() => {
            console.log("Scanner stopped successfully");
            html5QrCode.clear();
            scannerModal.classList.add('hidden');
        }).catch(err => {
            console.warn("Scanner stop error (might not be running):", err);
            html5QrCode.clear();
            scannerModal.classList.add('hidden');
        });
    } else {
        scannerModal.classList.add('hidden');
    }
}

socket.on('game_start', (state) => {
    console.log("SERVIDOR ENVIOU GAME_START. MODO DA SALA:", state.mode);
    gameState = state;
    // O MODO DO SERVIDOR É O QUE MANDA
    isRemoteMode = (state.mode === 'remote');

    waitingScreen.classList.add('hidden');
    remoteWaitingScreen.classList.add('hidden');

    menuMain.classList.add('hidden');
    menuCreate.classList.add('hidden');
    menuJoin.classList.add('hidden');
    if (mainLayout) mainLayout.classList.add('hidden');

    document.getElementById('score-container').classList.remove('hidden');
    statusMsg.innerText = "";

    SFX.score();
    lastBallDx = state.ball.dx;
    lastBallDy = state.ball.dy;
});

socket.on('game_update', (state) => {
    // Detect Events for Sound/Haptics
    if (gameState) {
        // DETECT RESET: If ball is suddenly in the middle area (serving position)
        // we force an update of the direction trackers without playing any sound.
        const isResetting = Math.abs(state.ball.y - 100) < 5;

        // Initialize last directions on first ever update
        if (lastBallDx === 0 && lastBallDy === 0) {
            lastBallDx = state.ball.dx;
            lastBallDy = state.ball.dy;
        }

        // Wall Hit - Muted as per user request
        /*
        if (Math.sign(state.ball.dx) !== Math.sign(lastBallDx) && Math.abs(state.ball.x - 50) > 45) {
            SFX.wall();
        }
        */

        // Paddle Hit (Ball changed vertical direction)
        // ONLY play if we are NOT in the middle of a reset
        if (!isResetting && Math.sign(state.ball.dy) !== Math.sign(lastBallDy)) {
            SFX.hit();
            triggerVibrate(30);
        }

        // Scoring
        const p1Id = Object.keys(state.players).find(id => state.players[id].side === 'bottom');
        const p2Id = Object.keys(state.players).find(id => state.players[id].side === 'top');
        if (p1Id && p2Id) {
            if (state.players[p1Id].score > lastP1Score || state.players[p2Id].score > lastP2Score) {
                // Play whistle when ball is returning to game
                SFX.score();
                triggerVibrate(150);
                lastP1Score = state.players[p1Id].score;
                lastP2Score = state.players[p2Id].score;
            }
        }
    }

    gameState = state;
    lastBallDx = state.ball.dx;
    lastBallDy = state.ball.dy;
    updateScores();
});

socket.on('player_disconnected', () => {
    // Current player saves the result (assuming they won by forfeit or just saving state)
    if (gameState && isRemoteMode) {
        saveOnlineMatchOnDisconnect();
    }
    document.getElementById('disconnect-modal').classList.remove('hidden');
    // We don't reload immediately anymore, the button in the modal handles it
});

function updateScores() {
    if (!gameState) return;

    const scoreContainer = document.getElementById('score-container');
    const theirScoreElem = document.getElementById('their-score');

    // Rely on gameState.mode from server
    const currentMode = gameState.mode || (isRemoteMode ? 'remote' : 'nearby');

    if (currentMode === 'remote') {
        scoreContainer.classList.add('remote-mode');
    } else {
        scoreContainer.classList.remove('remote-mode');
    }

    const myId = Object.keys(gameState.players).find(id => gameState.players[id].side === mySide);
    const theirSide = mySide === 'bottom' ? 'top' : 'bottom';
    const theirId = Object.keys(gameState.players).find(id => gameState.players[id].side === theirSide);

    const myScore = myId ? gameState.players[myId].score : 0;
    const theirScore = theirId ? gameState.players[theirId].score : 0;

    scoreElem.innerText = myScore;
    theirScoreElem.innerText = theirScore;
}

// Input Handling
let isTouching = false;
canvas.addEventListener('touchmove', handleInput);
canvas.addEventListener('touchstart', (e) => { isTouching = true; handleInput(e); });
canvas.addEventListener('touchend', () => { isTouching = false; });
canvas.addEventListener('mousemove', (e) => {
    if (!isTouching && gameState) {
        // Map mouse X to Game X (0-100)
        const rect = canvas.getBoundingClientRect();
        const scaleX = 100 / rect.width;
        let gameX = (e.clientX - rect.left) * scaleX;

        // Invert Input for Top Player
        if (mySide === 'top') {
            gameX = 100 - gameX;
        }

        if (isSoloMode) {
            gameState.players['solo'].x = Math.max(10, Math.min(90, gameX));
        } else {
            socket.emit('move_paddle', { roomId, x: gameX });
        }
    }
});

function handleInput(e) {
    if (gameState) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = 100 / rect.width;
        let gameX = (touch.clientX - rect.left) * scaleX;

        // Invert Input for Top Player
        if (mySide === 'top') {
            gameX = 100 - gameX;
        }

        if (isSoloMode) {
            gameState.players['solo'].x = Math.max(10, Math.min(90, gameX));
        } else {
            socket.emit('move_paddle', { roomId, x: gameX });
        }
    }
}

// Rendering Loop
const COURT_WIDTH = 100;
const COURT_HEIGHT = 200; // Total world height

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!gameState) {
        requestAnimationFrame(render);
        return;
    }

    // Coordinate Transform
    const scaleX = canvas.width / COURT_WIDTH;

    // DECISAO DE VIEWPORT (FORÇADA PELO GAMESTATE SE EXISTIR)
    let fullArena = isRemoteMode;
    if (gameState && gameState.mode) {
        fullArena = (gameState.mode === 'remote');
    }

    const viewHeight = fullArena ? 200 : 100;
    const scaleY = canvas.height / viewHeight;

    function project(x, y) {
        let sx, sy;

        if (fullArena) {
            // MOSTRAR ARENA COMPLETA (0 a 200) - Cada pixel lógico mapeado para a tela inteira
            if (mySide === 'bottom') {
                sx = x * scaleX;
                sy = (200 - y) * scaleY;
            } else {
                sx = (100 - x) * scaleX;
                sy = y * scaleY;
            }
        } else {
            // MOSTRAR APENAS METADE (Modo Juntos)
            if (mySide === 'bottom') {
                sx = x * scaleX;
                sy = (100 - y) * scaleY;
            } else {
                sx = (100 - x) * scaleX;
                sy = (y - 100) * scaleY;
            }
        }
        return { x: sx, y: sy };
    }



    // Draw Ball (Stepped Square style like the "O" in PONG)
    const ballPos = project(gameState.ball.x, gameState.ball.y);

    if (ballPos.y >= -50 && ballPos.y <= canvas.height + 50) {
        ctx.fillStyle = '#ffffff';
        const radius = 3 * scaleX; // Slightly larger for detail
        const x = ballPos.x;
        const y = ballPos.y;
        const r = radius;

        // Draw a simple square ball
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }



    // Draw Paddles
    // P1 (Bottom)
    const p1Id = Object.keys(gameState.players).find(id => gameState.players[id].side === 'bottom');
    if (p1Id) {
        const p1 = gameState.players[p1Id];
        const p1Pos = project(p1.x, 5);
        ctx.fillStyle = '#ffffff';
        const pWidth = (p1.width || 20) * scaleX;
        const pHeight = 2 * scaleY;
        ctx.fillRect(p1Pos.x - pWidth / 2, p1Pos.y - pHeight / 2, pWidth, pHeight);
    }

    // P2 (Top)
    const p2Id = Object.keys(gameState.players).find(id => gameState.players[id].side === 'top');
    if (p2Id) {
        const p2 = gameState.players[p2Id];
        const p2Pos = project(p2.x, 195);
        ctx.fillStyle = '#ffffff';
        const pWidth = (p2.width || 20) * scaleX;
        const pHeight = 2 * scaleY;
        ctx.fillRect(p2Pos.x - pWidth / 2, p2Pos.y - pHeight / 2, pWidth, pHeight);
    }

    // Draw Divider Line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;

    if (isSoloMode) {
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(canvas.width, 0); ctx.stroke();
    } else if (fullArena) {
        // MODO REMOTO: Rede exatamente no meio (Y Lógico 100)
        ctx.setLineDash([10, 15]);
        const midY = 100 * scaleY; // y=100 em uma arena de 200
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(canvas.width, midY);
        ctx.stroke();

        // Moldura para verificar se a arena está certa
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    } else {
        // MODO JUNTOS: Rede no topo da tela
        ctx.setLineDash([10, 15]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(canvas.width, 0);
        ctx.stroke();
    }

    ctx.setLineDash([]); // Reset

    requestAnimationFrame(render);
}

requestAnimationFrame(render);

/* RANKING & SUPABASE LOGIC */

if (rankingBtn) {
    rankingBtn.addEventListener('click', (e) => {
        e.preventDefault();
        rankingModal.classList.remove('hidden');
        fetchRanking();
    });
}

if (closeRankingBtn) {
    closeRankingBtn.addEventListener('click', () => {
        rankingModal.classList.add('hidden');
    });
}

if (historyBtn) {
    historyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        historyModal.classList.remove('hidden');
        fetchHistory();
    });
}

if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', () => {
        historyModal.classList.add('hidden');
    });
}

async function saveSoloScore(name, score) {
    if (!supabaseClient) return;
    try {
        console.log(`Saving solo score: ${name} - ${score}`);
        const { error } = await supabaseClient
            .from('solo_scores')
            .insert([{ name: name, score: score }]);

        if (error) console.error("Error saving score:", error);
        else console.log("Score saved!");
    } catch (err) {
        console.error("Save ex:", err);
    }
}

async function fetchRanking() {
    if (!rankingList) return;
    rankingList.innerHTML = '<li>CARREGANDO...</li>';
    if (!supabaseClient) {
        rankingList.innerHTML = '<li>ERRO: CONFIG SUPABASE</li>';
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('solo_scores')
            .select('name, score')
            .order('score', { ascending: false })
            .limit(10);

        if (error) throw error;

        rankingList.innerHTML = '';
        if (!data || data.length === 0) {
            rankingList.innerHTML = '<li>SEM PLACARES AINDA</li>';
            return;
        }

        data.forEach((entry, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="rank">#${index + 1}</span>
                <span class="name">${entry.name || 'ANÔNIMO'}</span>
                <span class="score">${entry.score}</span>
            `;
            rankingList.appendChild(li);
        });

    } catch (err) {
        console.error("Fetch ranking error:", err);
        rankingList.innerHTML = '<li>ERRO AO BUSCAR</li>';
    }
}

async function fetchHistory() {
    if (!historyList) return;
    historyList.innerHTML = '<li>CARREGANDO...</li>';
    if (!supabaseClient) {
        historyList.innerHTML = '<li>ERRO: CONFIG SUPABASE</li>';
        return;
    }

    try {
        // Fetch last 10 global matches
        const { data, error } = await supabaseClient
            .from('online_matches')
            .select('player1, score1, player2, score2, winner, timestamp')
            .order('timestamp', { ascending: false })
            .limit(10);

        if (error) throw error;

        historyList.innerHTML = '';
        if (!data || data.length === 0) {
            historyList.innerHTML = '<li>SEM PARTIDAS AINDA</li>';
            return;
        }

        data.forEach((match) => {
            const li = document.createElement('li');

            const date = new Date(match.timestamp).toLocaleDateString('pt-BR');

            const p1Bold = match.winner === match.player1 ? 'color: var(--fg); font-weight: bold;' : 'opacity: 0.7;';
            const p2Bold = match.winner === match.player2 ? 'color: var(--fg); font-weight: bold;' : 'opacity: 0.7;';

            li.innerHTML = `
                <div style="display: flex; align-items: center; gap: 5px; font-size: 0.8rem;">
                    <span style="${p1Bold}">${match.player1} <small>(${match.score1})</small></span>
                    <span style="opacity: 0.4;">x</span>
                    <span style="${p2Bold}">${match.player2} <small>(${match.score2})</small></span>
                </div>
                <span style="font-size: 0.6rem; opacity: 0.5; white-space: nowrap;">${date}</span>
            `;
            historyList.appendChild(li);
        });

    } catch (err) {
        console.error("Fetch history error:", err);
        historyList.innerHTML = '<li>ERRO AO BUSCAR</li>';
    }
}

async function saveOnlineMatchOnDisconnect() {
    if (!supabaseClient || !gameState) return;

    // Identify players
    const myId = Object.keys(gameState.players).find(id => gameState.players[id].side === mySide);
    const theirSide = mySide === 'bottom' ? 'top' : 'bottom';
    const theirId = Object.keys(gameState.players).find(id => gameState.players[id].side === theirSide);

    const myPlayer = gameState.players[myId];
    // theirPlayer logic: try to find it, but if it's gone from state, we rely on what we have.
    // If this function is called, gameState implies we have the state.
    const theirPlayer = gameState.players[theirId];

    if (myPlayer) {
        const myName = myPlayer.name || (mySide === 'bottom' ? 'JOGADOR 1' : 'JOGADOR 2');
        const myScore = myPlayer.score;

        let theirName = 'OPONENTE';
        let theirScore = 0;

        if (theirPlayer) {
            theirName = theirPlayer.name || 'OPONENTE';
            theirScore = theirPlayer.score;
        }

        console.log(`Saving match: ${myName} (${myScore}) vs ${theirName} (${theirScore})`);

        try {
            await supabaseClient
                .from('online_matches')
                .insert([{
                    player1: myName,
                    score1: myScore,
                    player2: theirName,
                    score2: theirScore,
                    winner: (myScore > theirScore) ? myName : ((theirScore > myScore) ? theirName : 'EMPATE'),
                    timestamp: new Date().toISOString()
                }]);
            console.log("Online match saved");
        } catch (e) {
            console.error("Error saving match:", e);
        }
    }
}
