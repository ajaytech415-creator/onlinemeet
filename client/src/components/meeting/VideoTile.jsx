import { useEffect, useRef } from 'react';

export default function VideoTile({ stream, name, isLocal, audioEnabled = true, videoEnabled = true, isScreenShare = false }) {
  const videoRef = useRef(null);
  const letter = name?.charAt(0)?.toUpperCase() || '?';
  const showVideo = stream && videoEnabled;

  // Attach the stream srcObject whenever the stream changes OR when camera is toggled back on
  useEffect(() => {
    if (videoRef.current && stream) {
      // Always reassign srcObject so the video element re-renders its frame
      videoRef.current.srcObject = stream;
      // If track is enabled, ensure we play
      if (videoEnabled) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [stream, videoEnabled]);

  return (
    <div className="video-tile" style={{ position: 'relative', background: '#0F0820', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Always keep the video element in the DOM so srcObject is never lost */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: showVideo ? 'block' : 'none',
          transform: isLocal && !isScreenShare ? 'scaleX(-1)' : 'none'
        }}
      />

      {/* Avatar shown when camera is off */}
      {!showVideo && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%', height: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #0F0820 0%, #1A0D3A 100%)', position: 'absolute', inset: 0 }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #7C3AED, #E879F9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700', color: 'white', boxShadow: '0 0 20px rgba(124,58,237,0.5)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {letter}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: 0 }}>{isLocal ? 'Camera off' : 'No video'}</p>
        </div>
      )}

      {/* Name + mic badge */}
      <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 }}>
        <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '6px', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {name}{isLocal ? ' (You)' : ''}
        </div>
        {!audioEnabled && (
          <div style={{ background: 'rgba(255,74,106,0.85)', borderRadius: '6px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </div>
        )}
      </div>

      {/* Screen share label */}
      {isScreenShare && (
        <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(124,58,237,0.9)', color: 'white', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', zIndex: 2 }}>
          Screen
        </div>
      )}
    </div>
  );
}
