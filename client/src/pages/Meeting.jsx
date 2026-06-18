import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import { usePeerConnections } from '../hooks/usePeerConnections';
import { useLocalMedia } from '../hooks/useMedia';
import {
  setStatus, addParticipant, removeParticipant,
  addToWaiting, removeFromWaiting, addMessage,
  resetMeeting, setRoomId, setScreenSharing,
  addRaisedHand, updateParticipantMedia,
} from '../store/slices/meetingSlice';
import VideoGrid from '../components/meeting/VideoGrid';
import ControlBar from '../components/meeting/ControlBar';
import ChatPanel from '../components/meeting/ChatPanel';
import ParticipantsPanel from '../components/meeting/ParticipantsPanel';
import WaitingPanel from '../components/meeting/WaitingPanel';

export default function Meeting() {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { user, token } = useSelector(s => s.auth);
  const { status, activePanel, waitingList } = useSelector(s => s.meeting);

  const isStaff = user?.role === 'staff';
  const isNewRoom = routeRoomId === 'new'; // staff arriving from Lobby
  const stateData = location.state || {};

  // liveRoomId: resolves to the actual roomId once we have it from the server
  const [liveRoomId, setLiveRoomId] = useState(isNewRoom ? null : routeRoomId);
  const roomIdRef = useRef(isNewRoom ? null : routeRoomId);

  // ── Media ─────────────────────────────────────────────────────────────
  const {
    localStream, screenStream, audioEnabled, videoEnabled,
    initMedia, toggleAudio, toggleVideo, startScreenShare, stopScreenShare, stopAll,
  } = useLocalMedia();

  // ── WebRTC ────────────────────────────────────────────────────────────
  const {
    peerStreams, setLocalStream, createPeer,
    handleOffer, handleAnswer, handleIce,
    removePeer, closeAll, replaceTrackOnAll,
  } = usePeerConnections();

  // ── Timer ─────────────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // ── Copy link state ───────────────────────────────────────────────────
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Join request toasts ───────────────────────────────────────────────
  const [joinRequests, setJoinRequests] = useState([]);

  // ── Remote screen-sharing peers ───────────────────────────────────────
  const [remoteScreeners, setRemoteScreeners] = useState(new Set());

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }, []);

  // Keep roomIdRef in sync with liveRoomId for use in cleanup callbacks
  useEffect(() => { roomIdRef.current = liveRoomId; }, [liveRoomId]);

  // ── Main socket + WebRTC lifecycle ────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let socket;

    const run = async () => {
      // 1. Acquire local media
      const stream = await initMedia({
        audio: stateData.micOn !== false,
        video: stateData.camOn !== false,
      });
      if (!mounted) return;
      setLocalStream(stream);

      // 2. Connect socket (returns existing if already connected)
      socket = connectSocket({
        token,
        guestName: !token
          ? (stateData.guestName || user?.name || 'Guest')
          : undefined,
      });

      // ── Register ALL event listeners outside the connect callback ──────
      // This way they work even when socket was already connected (staff
      // coming from Lobby who already have a connected socket).

      socket.on('connect_error', (err) => {
        console.error('[socket] connect_error:', err.message);
        if (mounted) dispatch(setStatus('error'));
      });

      // Student admitted by staff → join the room
      socket.on('admitted', ({ roomId: admittedRoomId, existingParticipants }) => {
        if (!mounted) return;
        socket.emit('join-room', { roomId: admittedRoomId }, (res) => {
          if (!mounted) return;
          dispatch(setStatus('live'));
          startTimer();
          const existing = res?.existingParticipants || existingParticipants || [];
          existing.forEach(p => {
            if (p.socketId !== socket.id) {
              dispatch(addParticipant({ socketId: p.socketId, name: p.name, role: p.role }));
              createPeer(p.socketId, p.name, { initiator: true, socket });
            }
          });
        });
      });

      socket.on('rejected', () => {
        if (mounted) dispatch(setStatus('rejected'));
      });

      // A new participant fully joined the room — create peer for them
      socket.on('user-joined', ({ socketId, name, role }) => {
        if (!mounted) return;
        dispatch(addParticipant({ socketId, name, role }));
        dispatch(addMessage({
          senderId: '__system__',
          senderName: 'System',
          message: `${name} joined the class`,
          timestamp: Date.now(),
          _system: true,
        }));
        // The joining peer will send us an offer; we just wait
      });

      // Staff sees join requests in Waiting panel + toast
      socket.on('join-request', ({ socketId, name }) => {
        if (!mounted) return;
        dispatch(addToWaiting({ socketId, name }));
        setJoinRequests(prev => [...prev, { socketId, name, id: Date.now() }]);
      });

      // A participant left — inform peers and clean up
      socket.on('user-left', ({ socketId, name }) => {
        if (!mounted) return;
        removePeer(socketId);
        dispatch(removeParticipant(socketId));
        dispatch(removeFromWaiting(socketId));
        if (name) {
          dispatch(addMessage({
            senderId: '__system__',
            senderName: 'System',
            message: `${name} left the class`,
            timestamp: Date.now(),
            _system: true,
          }));
        }
      });

      socket.on('meeting-ended', () => {
        if (mounted) dispatch(setStatus('ended'));
      });

      // Staff kicked this user
      socket.on('kicked', () => {
        if (!mounted) return;
        stopAll();
        closeAll();
        dispatch(resetMeeting());
        navigate('/', { replace: true });
      });

      // ── WebRTC signals ────────────────────────────────────────────────
      socket.on('webrtc-offer', (data) => { if (mounted) handleOffer(data, socket); });
      socket.on('webrtc-answer', (data) => { if (mounted) handleAnswer(data); });
      socket.on('webrtc-ice', (data) => { if (mounted) handleIce(data); });

      // ── Chat ──────────────────────────────────────────────────────────
      socket.on('new-message', (msg) => { if (mounted) dispatch(addMessage(msg)); });

      // ── Raised hand ───────────────────────────────────────────────────
      socket.on('hand-raised', (data) => { if (mounted) dispatch(addRaisedHand(data)); });

      // ── Peer media state (fixes remote mic/cam indicator bug) ─────────
      socket.on('peer-media-state', ({ socketId, audio, video }) => {
        if (mounted) dispatch(updateParticipantMedia({ socketId, audio, video }));
      });

      // ── Remote screen share tracking ──────────────────────────────────
      socket.on('screen-share-started', ({ socketId }) => {
        if (mounted) setRemoteScreeners(prev => new Set([...prev, socketId]));
      });
      socket.on('screen-share-stopped', ({ socketId }) => {
        if (mounted) setRemoteScreeners(prev => {
          const n = new Set(prev);
          n.delete(socketId);
          return n;
        });
      });

      // ── Connect callback: room creation / join request ─────────────────
      const onConnect = () => {
        if (!mounted) return;
        if (isStaff) {
          socket.emit('staff-create-room', (res) => {
            if (!mounted) return;
            if (res?.error) {
              console.error('[staff-create-room]', res.error);
              dispatch(setStatus('error'));
              return;
            }
            const resolvedRoomId = res.roomId;
            setLiveRoomId(resolvedRoomId);
            roomIdRef.current = resolvedRoomId;
            dispatch(setRoomId(resolvedRoomId));
            dispatch(setStatus('live'));
            startTimer();

            // If staff came from /meeting/new, update URL to the actual roomId
            if (isNewRoom) {
              navigate(`/meeting/${resolvedRoomId}`, { replace: true, state: stateData });
            }

            // Connect to any existing participants (rare on first open)
            res.participants?.forEach(p => {
              if (p.socketId !== socket.id) {
                dispatch(addParticipant(p));
                createPeer(p.socketId, p.name, { initiator: true, socket });
              }
            });
          });
        } else {
          // Student: request to enter the waiting room
          dispatch(setStatus('waiting'));
          const targetRoomId = routeRoomId; // students always have a real roomId in URL
          socket.emit('student-request-join', { roomId: targetRoomId }, (res) => {
            if (res?.error) {
              console.error('[student-request-join]', res.error);
              dispatch(setStatus('error'));
            }
          });
        }
      };

      // Fire immediately if socket is already connected (staff coming from Lobby),
      // otherwise wait for the connect event.
      if (socket.connected) {
        onConnect();
      } else {
        socket.once('connect', onConnect);
      }
    };

    run();

    return () => {
      mounted = false;
      clearInterval(timerRef.current);
      stopAll();
      closeAll();
      const s = getSocket();
      if (s) {
        const r = roomIdRef.current;
        if (r) s.emit('leave-room', { roomId: r });
        disconnectSocket();
      }
      dispatch(resetMeeting());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────
  const getRoomId = () => liveRoomId || routeRoomId;

  // ── Screen share ───────────────────────────────────────────────────────
  const handleScreenShare = useCallback(async () => {
    const socket = getSocket();
    const roomId = getRoomId();
    if (screenStream) {
      stopScreenShare();
      if (localStream) {
        const camTrack = localStream.getVideoTracks()[0];
        if (camTrack) replaceTrackOnAll(camTrack, 'video');
      }
      socket?.emit('screen-share-stop', { roomId });
      dispatch(setScreenSharing(false));
    } else {
      const stream = await startScreenShare();
      if (!stream) return;
      const screenTrack = stream.getVideoTracks()[0];
      replaceTrackOnAll(screenTrack, 'video');
      socket?.emit('screen-share-start', { roomId });
      dispatch(setScreenSharing(true));
      screenTrack.onended = () => {
        dispatch(setScreenSharing(false));
        socket?.emit('screen-share-stop', { roomId });
        if (localStream) {
          const camTrack = localStream.getVideoTracks()[0];
          if (camTrack) replaceTrackOnAll(camTrack, 'video');
        }
      };
    }
  }, [screenStream, localStream, liveRoomId, stopScreenShare, startScreenShare, replaceTrackOnAll, dispatch]);

  const handleToggleAudio = () => {
    const newVal = toggleAudio();
    getSocket()?.emit('media-state', {
      roomId: getRoomId(),
      audio: newVal !== undefined ? newVal : !audioEnabled,
      video: videoEnabled,
    });
  };

  const handleToggleVideo = () => {
    const newVal = toggleVideo();
    getSocket()?.emit('media-state', {
      roomId: getRoomId(),
      audio: audioEnabled,
      video: newVal !== undefined ? newVal : !videoEnabled,
    });
  };

  const handleRaiseHand = () => {
    getSocket()?.emit('raise-hand', { roomId: getRoomId() });
  };

  const handleEnd = () => {
    const roomId = getRoomId();
    const socket = getSocket();
    if (isStaff) {
      socket?.emit('end-meeting', { roomId });
    } else {
      socket?.emit('leave-room', { roomId });
    }
    stopAll();
    closeAll();
    disconnectSocket();
    dispatch(resetMeeting());
    navigate('/');
  };

  const copyLink = () => {
    const roomId = getRoomId();
    if (!roomId || roomId === 'new') return;
    navigator.clipboard.writeText(`${window.location.origin}/join/${roomId}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  const dismissRequest = (id) => setJoinRequests(prev => prev.filter(r => r.id !== id));

  const admitFromToast = (req) => {
    getSocket()?.emit('admit-student', { roomId: getRoomId(), targetSocketId: req.socketId });
    dispatch(removeFromWaiting(req.socketId));
    dismissRequest(req.id);
  };

  const rejectFromToast = (req) => {
    getSocket()?.emit('reject-student', { roomId: getRoomId(), targetSocketId: req.socketId });
    dispatch(removeFromWaiting(req.socketId));
    dismissRequest(req.id);
  };

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const displayRoomId = liveRoomId && liveRoomId !== 'new' ? liveRoomId : routeRoomId;

  // ── Status screens ────────────────────────────────────────────────────
  if (status === 'waiting') {
    return (
      <div style={{ height: '100vh', background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.3), transparent), #070412', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '24px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#E879F9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', boxShadow: '0 0 40px rgba(168,85,247,.6)' }}>⏳</div>
          <div style={{ position: 'absolute', inset: '-8px', borderRadius: '50%', border: '2px solid rgba(168,85,247,0.5)', animation: 'pulse-waiting 2s infinite' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Waiting for the host</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px' }}>The staff member will let you in shortly...</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '12px', padding: '14px 24px', color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
          Room: <strong style={{ color: '#A855F7', letterSpacing: '2px' }}>{displayRoomId}</strong>
        </div>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>
          Cancel
        </button>
        <style>{`@keyframes pulse-waiting { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.15);opacity:.2} }`}</style>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div style={{ height: '100vh', background: '#070412', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ fontSize: '56px' }}>🚫</div>
        <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '700' }}>Entry Declined</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px' }}>The host did not admit you to this class.</p>
        <button className="btn-primary" onClick={() => navigate('/')}>Return to Home</button>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div style={{ height: '100vh', background: '#070412', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ fontSize: '56px' }}>🎓</div>
        <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '700' }}>Class Ended</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px' }}>The session has ended. Thank you!</p>
        <button className="btn-primary" onClick={() => navigate('/')}>Return to Home</button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ height: '100vh', background: '#070412', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ fontSize: '56px' }}>⚠️</div>
        <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '700' }}>Connection Error</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px' }}>Could not connect to the session. Please try again.</p>
        <button className="btn-primary" onClick={() => navigate('/')}>Return to Home</button>
      </div>
    );
  }

  // ── Main meeting UI ───────────────────────────────────────────────────
  return (
    <div className="meeting-layout" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>

      {/* ── Header ── */}
      <div className="meeting-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #7C3AED, #A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
            </div>
            <span style={{ fontWeight: '800', fontSize: '14px' }}>EduMeet</span>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

          {/* Room code + LIVE badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {displayRoomId && displayRoomId !== 'new' && (
              <div style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: '8px', padding: '4px 10px' }}>
                <span style={{ color: 'var(--secondary)', fontSize: '13px', fontWeight: '700', letterSpacing: '2px' }}>{displayRoomId}</span>
              </div>
            )}
            {status === 'live' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,74,106,0.15)', border: '1px solid rgba(255,74,106,0.3)', borderRadius: '6px', padding: '3px 8px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--red)', animation: 'blink 1.5s infinite' }} />
                <span style={{ color: 'var(--red)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Live</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Timer */}
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: '600', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>
            {fmt(elapsed)}
          </div>

          {/* Copy link (staff only, room must be resolved) */}
          {isStaff && displayRoomId && displayRoomId !== 'new' && (
            <button
              onClick={copyLink}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: linkCopied ? 'rgba(0,214,143,0.15)' : 'rgba(124,58,237,0.15)',
                border: `1px solid ${linkCopied ? 'rgba(0,214,143,0.3)' : 'var(--border)'}`,
                borderRadius: '8px', padding: '6px 14px',
                color: linkCopied ? 'var(--green)' : 'var(--secondary)',
                cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                fontFamily: 'inherit', transition: 'all .2s',
              }}
            >
              {linkCopied ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Share Link</>
              )}
            </button>
          )}

          {/* User pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', borderRadius: '99px', padding: '4px 12px 4px 6px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#E879F9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#fff' }}>
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{user?.name}</span>
          </div>
        </div>
      </div>

      {/* ── Main area: video + side panel ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <VideoGrid
          localStream={localStream}
          peerStreams={peerStreams}
          localUser={user}
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          screenStream={screenStream}
          remoteScreeners={remoteScreeners}
        />
        {activePanel === 'chat' && <ChatPanel roomId={getRoomId()} />}
        {activePanel === 'participants' && <ParticipantsPanel localUser={user} roomId={getRoomId()} />}
        {activePanel === 'waiting' && isStaff && <WaitingPanel roomId={getRoomId()} />}
      </div>

      {/* ── Control Bar ── */}
      <ControlBar
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isScreenSharing={!!screenStream}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onScreenShare={handleScreenShare}
        onRaiseHand={handleRaiseHand}
        onEnd={handleEnd}
        isStaff={isStaff}
      />

      {/* ── Join Request Toasts (staff) ── */}
      <div style={{ position: 'fixed', top: '72px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 9999 }}>
        {joinRequests.map(req => (
          <div key={req.id} className="request-popup animate-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#E879F9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: '#fff', fontSize: '16px', flexShrink: 0 }}>
                {req.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={{ color: '#fff', fontWeight: '700', fontSize: '14px', margin: 0 }}>{req.name}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0' }}>Wants to join the class</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => admitFromToast(req)} style={{ flex: 1, background: 'var(--green)', border: 'none', borderRadius: '8px', padding: '9px', color: '#fff', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                ✓ Admit
              </button>
              <button onClick={() => rejectFromToast(req)} style={{ flex: 1, background: 'rgba(255,74,106,0.15)', border: '1px solid rgba(255,74,106,0.35)', borderRadius: '8px', padding: '9px', color: 'var(--red)', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                ✗ Deny
              </button>
              <button onClick={() => dismissRequest(req.id)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-light)', borderRadius: '8px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
