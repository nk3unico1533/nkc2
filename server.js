// FILE: server.js
console.log("Starting OII C2 Server..."); // Log startup

const express = require('express');
const { WebSocketServer } = require('ws');
const uuid = require('uuid');

const PORT = process.env.PORT || 3000;
const app = express();

// Health Check for Render (Keep-Alive)
app.get('/', (req, res) => {
  res.status(200).send('OII C2 Operational. Status: ONLINE');
});

const server = app.listen(PORT, () => console.log(`C2 Listening on port ${PORT}`));
const wss = new WebSocketServer({ server });

const agents = new Map(); 
const controllers = new Set(); 

// Heartbeat mechanism
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

  // Identify connection type
  const url = new URL(req.url, `http://${req.headers.host}`);
  const isController = url.searchParams.get('role') === 'dashboard';

  if (isController) {
    console.log('OII Dashboard Connected via WebSocket');
    controllers.add(ws);
    
    // Send immediate sync
    const agentList = Array.from(agents.values()).map(a => a.data);
    ws.send(JSON.stringify({ type: 'FULL_SYNC', payload: agentList }));
    
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        // Forward command to Agent
        if (data.action && data.agent_id && agents.has(data.agent_id)) {
          const agentWs = agents.get(data.agent_id).socket;
          if(agentWs.readyState === 1) {
             console.log(`Forwarding command to ${data.agent_id}: ${data.action}`);
             agentWs.send(JSON.stringify(data));
          }
        }
      } catch (e) { console.error("Error parsing dashboard msg:", e); }
    });
    
    ws.on('close', () => controllers.delete(ws));
  } 
  else {
    // Agent Logic
    const agentIdHeader = req.headers['agent-id'];
    
    if (!agentIdHeader) {
      console.log('Rejected connection: Missing agent-id');
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
    
    // Notify Dashboards
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
           broadcast({ type: 'CMD_RESPONSE', payload: message });
        }
      } catch (e) { console.error("Error parsing agent msg:", e); }
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
