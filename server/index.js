import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import initSocket, { rooms } from './socket/index.js';
import livekitRoutes from './routes/livekitRoutes.js';

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'edumeet_secret_key_2024';
let CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
if (CLIENT_URL.endsWith('/')) CLIENT_URL = CLIENT_URL.slice(0, -1);


// ─── Hardcoded Users ─────────────────────────────────────────────────────────
const USERS = {
  axon:  { password: 'admin', role: 'staff',   name: 'Axon (Staff)' },
  Ajay:  { password: '1111',  role: 'student',  name: 'Ajay' },
  navin: { password: '2222',  role: 'student',  name: 'Navin' },
};

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(morgan('dev'));

// Rate-limit login endpoint: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});

// ─── REST Routes ─────────────────────────────────────────────────────────────
app.use('/api/livekit', livekitRoutes);

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Username and password required' });
  const user = USERS[username];
  if (!user || user.password !== password)
    return res.status(401).json({ message: 'Invalid username or password' });
  const token = jwt.sign(
    { userId: username, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, user: { userId: username, name: user.name, role: user.role } });
});

app.get('/api/rooms/:roomId/validate', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ message: 'Room not found or class not started yet' });
  res.json({ roomId: req.params.roomId, hostName: room.hostName, active: true });
});

// ICE server configuration for WebRTC peers
app.get('/api/ice-config', (_, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  // If TURN credentials are configured, add them
  if (process.env.TURN_URL && process.env.TURN_USER && process.env.TURN_PASS) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USER,
      credential: process.env.TURN_PASS,
    });
  }
  res.json({ iceServers });
});

app.get('/api/health', (_, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ─── Socket.io ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
});

// JWT / guest auth middleware
io.use((socket, next) => {
  const { token, guestName } = socket.handshake.auth || {};

  if (token) {
    try {
      socket.data.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  }

  if (guestName && typeof guestName === 'string' && guestName.trim().length > 0) {
    socket.data.user = {
      userId: `guest_${socket.id.substring(0, 6)}`,
      name: guestName.trim(),
      role: 'student',
    };
    return next();
  }

  next(new Error('Authentication required'));
});

// Delegate all socket event handling to socket/index.js
initSocket(io);

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 EduMeet server → http://localhost:${PORT}`);
  console.log(`👤 Accounts: axon/admin (staff), Ajay/1111, navin/2222 (students)`);
});
