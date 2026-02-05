const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Game State
// struct: { [roomId]: { players: { [id]: { side: 'bottom'|'top', x: 50, score: 0 } }, ball: { x: 50, y: 100, dx: 1, dy: 1 }, status: 'waiting'|'playing' } }
const games = {};

const COURT_WIDTH = 100;
const COURT_HEIGHT = 200; // 0-100 is Bottom (P1), 100-200 is Top (P2)
const PADDLE_WIDTH = 20;

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    // Initial rooms update
    sendRoomsList();

    socket.on('get_rooms', () => {
        sendRoomsList(socket);
    });

    socket.on('create_game', (data) => {
        const roomName = data && data.roomName ? data.roomName.trim().substring(0, 15) : null;
        const mode = (data && data.mode) || 'remote';
        const playerName = (data && data.playerName) ? data.playerName.substring(0, 15) : 'JOGADOR 1';
        const roomId = Math.random().toString(36).substring(2, 7);

        games[roomId] = {
            name: roomName || `SALA ${roomId.toUpperCase()}`,
            mode: mode, // 'nearby' or 'remote'
            players: {
                [socket.id]: { side: 'bottom', x: 50, score: 0, width: 20, name: playerName }
            },
            ball: { x: 50, y: 100, dx: 0, dy: 0, lastHitBy: null },
            status: 'waiting'
        };
        socket.join(roomId);
        socket.emit('game_created', { roomId, side: 'bottom', mode: mode });
        sendRoomsList(); // Broadcast update
    });

    socket.on('join_game', (data) => {
        // Data can be just roomId (string) or object {roomId, playerName}
        // Handle both for backward compatibility or robust parsing
        let roomId, playerName;
        if (typeof data === 'object') {
            roomId = data.roomId;
            playerName = data.playerName || 'VIAJANTE';
        } else {
            roomId = data;
            playerName = 'VIAJANTE';
        }

        const game = games[roomId];
        if (game) {
            const playerCount = Object.keys(game.players).length;

            if (playerCount < 2) {
                // Join as Player 2
                game.players[socket.id] = { side: 'top', x: 50, score: 0, width: 20, name: playerName };
                game.status = 'playing';
                // Reset ball
                game.ball = { x: 50, y: 100, dx: (Math.random() > 0.5 ? 1 : -1) * 0.5, dy: (Math.random() > 0.5 ? 1 : -1) * 0.5 };

                socket.join(roomId);
                socket.emit('game_joined', { roomId, side: 'top', mode: game.mode, role: 'player' });
                io.to(roomId).emit('game_start', game);
                startGameLoop(roomId);
                sendRoomsList(); // Broadcast update
            } else {
                // Join as Spectator
                socket.join(roomId);
                socket.emit('game_joined', { roomId, side: 'spectator', mode: game.mode, role: 'spectator' });
                // If game is already running, send current state
                if (game.status === 'playing') {
                    socket.emit('game_update', game);
                    // Also send static game_start info so client can init
                    socket.emit('game_start', game);
                }
            }
        } else {
            socket.emit('error_msg', 'Room does not exist');
        }
    });

    socket.on('move_paddle', ({ roomId, x }) => {
        const game = games[roomId];
        if (game && game.players[socket.id]) {
            const player = game.players[socket.id];
            const pWidth = player.width || 20;
            const clampedX = Math.max(pWidth / 2, Math.min(COURT_WIDTH - pWidth / 2, x));
            player.x = clampedX;
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);

        let targetRoomId = null;
        for (const [roomId, game] of Object.entries(games)) {
            if (game.players[socket.id]) {
                targetRoomId = roomId;
                delete game.players[socket.id];
                io.to(roomId).emit('player_disconnected');
                if (Object.keys(game.players).length === 0) {
                    delete games[roomId];
                } else {
                    game.status = 'waiting';
                    delete games[roomId]; // Forced reset per previous instruction
                }
                sendRoomsList(); // Broadcast update
                break;
            }
        }
    });
});

function sendRoomsList(target = io) {
    const list = Object.entries(games)
        // .filter(([id, game]) => game.status === 'waiting') // Removed filter to allow spectating active games
        .map(([id, game]) => ({
            id,
            name: game.name,
            playerCount: Object.keys(game.players).length,
            status: game.status
        }));
    target.emit('rooms_update', list);
}

function startGameLoop(roomId) {
    let speedMultiplier = 1.0;
    let lastSpeedUpdate = Date.now();

    const interval = setInterval(() => {
        const game = games[roomId];
        if (!game || game.status !== 'playing') {
            clearInterval(interval);
            return;
        }

        // Increase speed every 5 seconds
        if (Date.now() - lastSpeedUpdate > 5000) {
            speedMultiplier += 0.1;
            lastSpeedUpdate = Date.now();
        }



        // Move Ball with Multiplier
        const prevY = game.ball.y;
        game.ball.x += game.ball.dx * speedMultiplier;
        game.ball.y += game.ball.dy * speedMultiplier;

        // Wall Collisions (Left/Right)
        if (game.ball.x <= 0 || game.ball.x >= COURT_WIDTH) {
            game.ball.dx *= -1;
        }

        // Paddle Collisions
        const PADDLE_Y_OFFSET_BOTTOM = 5;
        const PADDLE_Y_OFFSET_TOP = 195;
        const BALL_RADIUS = 2;
        const PADDLE_WIDTH_HALF = PADDLE_WIDTH / 2;

        // Detect if we CROSSED the bottom paddle line (Moving Down)
        // Check if we were above (or at) the line, and now we are below it.
        // Line is roughly at PADDLE_Y_OFFSET_BOTTOM + BALL_RADIUS
        if (game.ball.dy < 0 && prevY >= PADDLE_Y_OFFSET_BOTTOM && game.ball.y <= PADDLE_Y_OFFSET_BOTTOM + BALL_RADIUS) {
            const p1Id = Object.keys(game.players).find(id => game.players[id].side === 'bottom');
            if (p1Id) {
                const p1 = game.players[p1Id];
                const p1WidthHalf = (p1.width || 20) / 2;
                // Check X overlap
                if (Math.abs(game.ball.x - p1.x) < p1WidthHalf + BALL_RADIUS) {
                    // Hit!
                    game.ball.y = PADDLE_Y_OFFSET_BOTTOM + BALL_RADIUS; // Snap to surface
                    game.ball.dy *= -1;
                    game.ball.lastHitBy = p1Id;
                    // Slight hit boost independent of time multiplier
                    game.ball.dx *= 1.05;
                    game.ball.dy *= 1.05;

                    const hitOffset = (game.ball.x - p1.x) / p1WidthHalf;
                    game.ball.dx += hitOffset * 0.5;
                }
            }
        }

        // Detect if we CROSSED the top paddle line (Moving Up)
        // Check if we were below (or at) the line, and now we are above it.
        // Line is roughly at PADDLE_Y_OFFSET_TOP - BALL_RADIUS
        if (game.ball.dy > 0 && prevY <= PADDLE_Y_OFFSET_TOP && game.ball.y >= PADDLE_Y_OFFSET_TOP - BALL_RADIUS) {
            const p2Id = Object.keys(game.players).find(id => game.players[id].side === 'top');
            if (p2Id) {
                const p2 = game.players[p2Id];
                const p2WidthHalf = (p2.width || 20) / 2;
                if (Math.abs(game.ball.x - p2.x) < p2WidthHalf + BALL_RADIUS) {
                    // Hit!
                    game.ball.y = PADDLE_Y_OFFSET_TOP - BALL_RADIUS; // Snap
                    game.ball.dy *= -1;
                    game.ball.lastHitBy = p2Id;
                    game.ball.dx *= 1.05;
                    game.ball.dy *= 1.05;

                    const hitOffset = (game.ball.x - p2.x) / p2WidthHalf;
                    game.ball.dx += hitOffset * 0.5;
                }
            }
        }

        // Scoring (Out of Bounds)
        if (game.ball.y < -10) {
            // Ball passed Bottom Player (P1) -> Top Player (P2) Scores
            const p2Id = Object.keys(game.players).find(id => game.players[id].side === 'top');
            if (p2Id) game.players[p2Id].score += 1;

            // P2 Scored -> Serve towards P2 (Up, dy > 0)
            resetBall(game, 1);
            speedMultiplier = 1.0;
            lastSpeedUpdate = Date.now();
        } else if (game.ball.y > COURT_HEIGHT + 10) {
            // Ball passed Top Player (P2) -> Bottom Player (P1) Scores
            const p1Id = Object.keys(game.players).find(id => game.players[id].side === 'bottom');
            if (p1Id) game.players[p1Id].score += 1;

            // P1 Scored -> Serve towards P1 (Down, dy < 0)
            resetBall(game, -1);
            speedMultiplier = 1.0;
            lastSpeedUpdate = Date.now();
        }

        // Check Win Condition (First to 10)
        const p1 = Object.values(game.players).find(p => p.side === 'bottom');
        const p2 = Object.values(game.players).find(p => p.side === 'top');

        if (p1 && p2) {
            if (p1.score >= 10 || p2.score >= 10) {
                game.status = 'finished';
                const winnerId = p1.score >= 10 ? Object.keys(game.players).find(k => game.players[k] === p1) : Object.keys(game.players).find(k => game.players[k] === p2);
                game.winner = game.players[winnerId].name;
                io.to(roomId).emit('game_over', {
                    game: game,
                    winnerSide: p1.score >= 10 ? 'bottom' : 'top',
                    winnerName: game.winner
                });
                clearInterval(interval);
                // Optional: Clean up game after a delay
                setTimeout(() => {
                    delete games[roomId];
                }, 10000);
                return;
            }
        }

        io.to(roomId).emit('game_update', game);

    }, 1000 / 60); // 60 FPS
}

function resetBall(game, serveDirection) {
    game.ball.x = 50;
    game.ball.y = 100; // Always start from the middle

    // Randomize X velocity slightly
    game.ball.dx = (Math.random() > 0.5 ? 1 : -1) * 0.5;

    // Use serveDirection to determine Y velocity (up or down)
    if (serveDirection) {
        game.ball.dy = serveDirection * 0.5;
    } else {
        // Random direction if no serveDirection provided (e.g. game start)
        game.ball.dy = (Math.random() > 0.5 ? 1 : -1) * 0.5;
    }
    game.ball.lastHitBy = null; // Clear last hit on reset
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
