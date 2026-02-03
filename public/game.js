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
createBtn.addEventListener('click', () => {
    const roomName = customRoomNameInput.value.trim();
    const mode = document.querySelector('input[name="game-mode"]:checked').value;

    // FORÇAR MODO REMOTO NA VARIÁVEL LOCAL
    isRemoteMode = (mode === 'remote');
    console.log("BOTÃO CRIAR CLICADO. MODO ESCOLHIDO:", mode);

    socket.emit('create_game', { roomName, mode });
});

joinBtn.addEventListener('click', () => {
    const code = roomInput.value.trim();
    if (code) {
        isRemoteMode = true; // Joining via code is remote mode
        socket.emit('join_game', code);
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
        roomElem.innerHTML = `
            <span class="room-name">${room.name}</span>
            <span class="room-status">ENTRAR</span>
        `;
        roomElem.addEventListener('click', () => {
            isRemoteMode = true; // Joining via list is remote mode
            socket.emit('join_game', room.id);
        });
        roomsList.appendChild(roomElem);
    });
});

soloBtn.addEventListener('click', (e) => {
    e.preventDefault();
    startSoloMode();
});

function startSoloMode() {
    isSoloMode = true;
    mySide = 'bottom';
    menu.classList.add('hidden');
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

    startSoloLoop();
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

        // Ceiling Collision (The User wants the ball to bounce back)
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

                // Add point for hitting the paddle in solo mode?
                // Or just keep the score for how many times you hit it?
                player.score += 1;
                scoreElem.innerText = player.score;
            }
        }

        // Death
        if (ball.y < -5) {
            triggerVibrate(200);
            // Reset ball
            ball.x = 50;
            ball.y = 50;
            ball.dx = (Math.random() > 0.5 ? 1 : -1) * 0.5;
            ball.dy = 0.5;
            // Update trackers immediately to prevent ghost collision sound
            lastBallDx = ball.dx;
            lastBallDy = ball.dy;
            speedMultiplier = 1.0;
            lastSpeedUpdate = Date.now();
            player.score = 0;
            scoreElem.innerText = "0";
        }

    }, 1000 / 60);
}

// Socket Events
socket.on('game_created', (data) => {
    roomId = data.roomId;
    mySide = data.side;
    isRemoteMode = (data.mode === 'remote');
    console.log("Room created! Mode:", data.mode);

    menu.classList.add('hidden');

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
    isRemoteMode = (data.mode === 'remote');

    // Start immediately
    menu.classList.add('hidden');
    waitingScreen.classList.add('hidden');
    remoteWaitingScreen.classList.add('hidden');
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
    menu.classList.remove('hidden');

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
            socket.emit('join_game', code);
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
    menu.classList.add('hidden');
    document.getElementById('score-container').classList.remove('hidden');

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
