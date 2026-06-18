import { useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function usePeerConnections() {
  const [peerStreams, setPeerStreams] = useState({}); // socketId → { stream, name }
  const peersRef = useRef({});              // socketId → RTCPeerConnection
  const localStreamRef = useRef(null);      // shared ref to local stream

  const setLocalStream = useCallback((stream) => {
    localStreamRef.current = stream;
  }, []);

  // Add/replace local tracks on all existing peers (for screen share swap)
  const replaceTrackOnAll = useCallback((newTrack, kind) => {
    Object.values(peersRef.current).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === kind);
      if (sender && newTrack) sender.replaceTrack(newTrack).catch(console.error);
    });
  }, []);

  const createPeer = useCallback((socketId, name, { initiator, socket }) => {
    // Close existing if any
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[socketId] = pc;

    // Add local tracks
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    }

    // ICE candidates → relay to peer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('webrtc-ice', { targetSocketId: socketId, candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        setPeerStreams(prev => { const n = { ...prev }; delete n[socketId]; return n; });
      }
    };

    // Remote stream
    const remoteStream = new MediaStream();
    pc.ontrack = ({ track }) => {
      remoteStream.addTrack(track);
      setPeerStreams(prev => ({
        ...prev,
        [socketId]: { stream: remoteStream, name },
      }));
    };

    // If initiator → create offer immediately
    if (initiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc-offer', { targetSocketId: socketId, offer: pc.localDescription });
        })
        .catch(console.error);
    }

    return pc;
  }, []);

  const handleOffer = useCallback(async ({ fromSocketId, fromName, offer }, socket) => {
    const pc = createPeer(fromSocketId, fromName, { initiator: false, socket });

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { targetSocketId: fromSocketId, answer: pc.localDescription });
    } catch (e) {
      console.error('Error handling offer:', e);
    }
  }, [createPeer]);

  const handleAnswer = useCallback(({ fromSocketId, answer }) => {
    const pc = peersRef.current[fromSocketId];
    if (pc && pc.signalingState !== 'stable') {
      pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
    }
  }, []);

  const handleIce = useCallback(({ fromSocketId, candidate }) => {
    const pc = peersRef.current[fromSocketId];
    if (pc && candidate) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }
  }, []);

  const removePeer = useCallback((socketId) => {
    const pc = peersRef.current[socketId];
    if (pc) { pc.close(); delete peersRef.current[socketId]; }
    setPeerStreams(prev => { const n = { ...prev }; delete n[socketId]; return n; });
  }, []);

  const closeAll = useCallback(() => {
    Object.values(peersRef.current).forEach(pc => { try { pc.close(); } catch {} });
    peersRef.current = {};
    setPeerStreams({});
  }, []);

  return {
    peerStreams,
    setLocalStream,
    createPeer,
    handleOffer,
    handleAnswer,
    handleIce,
    removePeer,
    closeAll,
    replaceTrackOnAll,
  };
}
