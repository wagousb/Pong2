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

let mySide = null; // 'bottom' or 'top'
let roomId = null;
let gameState = null;

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

scanBtn.addEventListener('click', () => {
    scannerModal.classList.remove('hidden');

    // Initialize Scanner
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" }, // Rear camera
        {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        },
        (decodedText, decodedResult) => {
            // Success
            console.log(`Code scanned = ${decodedText}`);

            // Extract room from URL if it's a URL
            // Format: http://host/?room=XYZ
            let code = decodedText;
            try {
                const url = new URL(decodedText);
                const room = url.searchParams.get('room');
                if (room) code = room;
            } catch (e) {
                // Not a URL, maybe just the code
            }

            roomInput.value = code;
            socket.emit('join_game', code);
            stopScanner();
        },
        (errorMessage) => {
            // Parse error, ignore
        }
    ).catch(err => {
        alert("Camera error: " + err);
        scannerModal.classList.add('hidden');
    });
});

closeScannerBtn.addEventListener('click', () => {
    stopScanner();
});

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            scannerModal.classList.add('hidden');
        }).catch(err => {
            console.error(err);
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
});

socket.on('game_update', (state) => {
    gameState = state;
    updateScores();
});

socket.on('player_disconnected', () => {
    alert('O outro jogador desconectou!');
    window.location.reload(); // Simplest way to "return to start" cleanly
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

        socket.emit('move_paddle', { roomId, x: gameX });
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

        socket.emit('move_paddle', { roomId, x: gameX });
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

    // Draw Ball (Square)
    const ballPos = project(gameState.ball.x, gameState.ball.y);

    // Draw ball even if slightly off-screen for transition smoothness
    if (ballPos.y >= -50 && ballPos.y <= canvas.height + 50) {
        ctx.fillStyle = '#ffffff';
        const radius = 2 * scaleX;
        // Draw square centered at x,y
        ctx.fillRect(ballPos.x - radius, ballPos.y - radius, radius * 2, radius * 2);
    }

    // Draw Paddles
    // P1 (Bottom)
    const p1Id = Object.keys(gameState.players).find(id => gameState.players[id].side === 'bottom');
    if (p1Id) {
        const p1 = gameState.players[p1Id];
        const p1Pos = project(p1.x, 5);
        ctx.fillStyle = '#ffffff';
        const pWidth = 20 * scaleX;
        const pHeight = 2 * scaleY;
        ctx.fillRect(p1Pos.x - pWidth / 2, p1Pos.y - pHeight / 2, pWidth, pHeight);
    }

    // P2 (Top)
    const p2Id = Object.keys(gameState.players).find(id => gameState.players[id].side === 'top');
    if (p2Id) {
        const p2 = gameState.players[p2Id];
        const p2Pos = project(p2.x, 195);
        ctx.fillStyle = '#ffffff';
        const pWidth = 20 * scaleX;
        const pHeight = 2 * scaleY;
        ctx.fillRect(p2Pos.x - pWidth / 2, p2Pos.y - pHeight / 2, pWidth, pHeight);
    }

    // Draw Divider Line (Dashed)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 15]); // Dash pattern

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
