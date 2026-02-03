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

let mySide = null; // 'bottom' or 'top'
let roomId = null;
let gameState = null;
let lastBallDx = 0;
let lastBallDy = 0;
let lastP1Score = 0;
let lastP2Score = 0;
let isSoloMode = false;
let soloInterval = null;

// Audio System
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const hitSound = new Audio('https://gfxsounds.com/wp-content/uploads/2021/03/Hitting-the-ball-table-tennis-paddle.mp3');
hitSound.preload = 'auto';

const whistleSound = new Audio('https://www.soundjay.com/misc/sounds/referee-whistle-01.mp3'); // High-pitched sharp whistle
whistleSound.preload = 'auto';

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
    hit: () => {
        // Use the real audio sample
        const sound = hitSound.cloneNode();
        sound.volume = 0.6;
        sound.play().catch(e => console.warn("Audio play blocked:", e));
    },
    wall: () => playSound(330, 'square', 0.08),
    score: () => {
        // Realistic referee whistle
        const sound = whistleSound.cloneNode();
        sound.volume = 0.6;
        sound.play().catch(e => {
            console.warn("Audio play blocked. Attempting to resume AudioContext...", e);
            if (audioCtx.state === 'suspended') audioCtx.resume();
        });
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

// UI Handlers
createBtn.addEventListener('click', () => {
    socket.emit('create_game');
});

joinBtn.addEventListener('click', () => {
    const code = roomInput.value.trim();
    if (code) {
        socket.emit('join_game', code);
    }
});

soloBtn.addEventListener('click', (e) => {
    e.preventDefault();
    startSoloMode();
});

function startSoloMode() {
    isSoloMode = true;
    mySide = 'bottom';
    menu.classList.add('hidden');
    document.getElementById('score-container').classList.remove('hidden');

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

    // Show waiting screen
    menu.classList.add('hidden');
    waitingScreen.classList.remove('hidden');
    displayRoomCode.innerText = roomId;

    // Generate QR Code
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
});

socket.on('game_joined', (data) => {
    roomId = data.roomId;
    mySide = data.side;

    // Start immediately
    menu.classList.add('hidden');
    waitingScreen.classList.add('hidden');
});

// Auto-Join if room param exists
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
    roomInput.value = roomParam;
    socket.emit('join_game', roomParam);
}

// Back Button
const backBtn = document.getElementById('back-btn');
function handleBack(e) {
    e.preventDefault(); // Prevents ghost clicks and default behavior
    e.stopPropagation();
    console.log("Back button activated!");

    // Soft Reset UI
    waitingScreen.classList.add('hidden');
    menu.classList.remove('hidden'); // Show menu immediately

    // Clear Local State
    roomId = null;
    gameState = null;
    mySide = null;
    isSoloMode = false;
    if (soloInterval) clearInterval(soloInterval);

    // Reset Socket
    // Use a short timeout to ensure the UI update renders before any potential socket lag
    setTimeout(() => {
        socket.disconnect();
        socket.connect();
    }, 50);
}

backBtn.addEventListener('click', handleBack);
backBtn.addEventListener('touchstart', handleBack, { passive: false });

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
    gameState = state;
    waitingScreen.classList.add('hidden');
    menu.classList.add('hidden');
    document.getElementById('score-container').classList.remove('hidden');

    // Play the start whistle
    SFX.score();

    // Initialize direction trackers to avoid ghost sounds on launch
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

    // Calculate My Score
    // If I am socket.id... wait, I don't know my socket.id easily effectively unless I store it?
    // Actually, I can derive my score from 'mySide'.

    const myId = Object.keys(gameState.players).find(id => gameState.players[id].side === mySide);
    const myScore = myId ? gameState.players[myId].score : 0;

    scoreElem.innerText = myScore;
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
// My Viewport:
// If Bottom: Y 0 to 100.
// If Top: Y 200 to 100 (Inverted).

function render() {
    // Clear (Transparent to show score)
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Use clearRect instead of fillRect(black)

    if (!gameState) {
        requestAnimationFrame(render);
        return;
    }

    // Coordinate Transform
    const scaleX = canvas.width / COURT_WIDTH;
    const scaleY = canvas.height / 100;

    function project(x, y) {
        let sx, sy;

        if (mySide === 'bottom') {
            // Standard View
            sx = x * scaleX;
            sy = (100 - y) * scaleY;
        } else {
            // Top Player (Inverted View for Head-to-Head)
            // X: 100 -> 0 (Left), 0 -> 100 (Right)
            sx = (100 - x) * scaleX;
            // Y: 100 -> 0 (Top), 200 -> 100 (Bottom)
            sy = (y - 100) * scaleY;
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

    // Draw Divider Line (Dashed only in Multiplayer)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    if (isSoloMode) {
        ctx.setLineDash([]); // Solid wall for solo
    } else {
        ctx.setLineDash([10, 15]); // Dash pattern for multiplayer
    }

    // Line is always at Y=100.
    // For P1, Y=100 is Top (sy=0).
    // For P2, Y=100 is Top (sy=0).
    // Wait, if P2 Y=100 maps to sy=0 (Top)...
    // Then both players see the "Divider" at the Top of their screen.
    // Which creates the seam. This is correct.

    ctx.beginPath();
    ctx.moveTo(0, 0); // Top of screen
    ctx.lineTo(canvas.width, 0);
    ctx.stroke();

    ctx.setLineDash([]); // Reset

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
