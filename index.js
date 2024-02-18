const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Connect to SQLite database
const db = new sqlite3.Database('chat.db'); // Use a file-based database

// Create messages table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    username TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const users = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Retrieve previous messages from the database
    db.all('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50', (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        socket.emit('previous messages', rows.reverse());
    });

    socket.on('new user', (username) => {
        users[socket.id] = { username, connectedAt: new Date() };
        io.emit('update users', Object.values(users));
    });

    socket.on('message', (data) => {
        if (!users[socket.id]) {
            return socket.emit('error', 'You must set a username before sending a message');
        }

        const { username } = users[socket.id];
        const messageData = { userId: socket.id, username, message: data };

        // Insert the message into the database
        db.run('INSERT INTO messages (userId, username, message) VALUES (?, ?, ?)', [socket.id, username, data], (err) => {
            if (err) {
                console.error(err);
                return;
            }
            io.emit('message', messageData);
        });
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        io.emit('update users', Object.values(users));
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
