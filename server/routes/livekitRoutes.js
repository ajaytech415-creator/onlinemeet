import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// Generate a token for a user to join a specific LiveKit room
router.get('/get-token', (req, res) => {
  const { room, participantName } = req.query;

  if (!room || !participantName) {
    return res.status(400).json({ error: 'room and participantName are required' });
  }

  // Use process.env variables, or fallback to dummy keys if run locally without .env.
  // We recommend the user define these in .env when possible.
  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
    });
    
    // Set permissions: allow user to join the room, publish/subscribe tracks.
    at.addGrant({ roomJoin: true, room: room, canPublish: true, canSubscribe: true });

    const token = at.toJwt();
    res.json({ token });
  } catch (err) {
    console.error('Error generating LiveKit token:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
