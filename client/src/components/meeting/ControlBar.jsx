import { useSelector, useDispatch } from 'react-redux';
import { setActivePanel } from '../../store/slices/meetingSlice';

const Btn = ({ icon, label, onClick, active = false, danger = false, off = false, badge = 0 }) => (
  <button
    onClick={onClick}
    className={`ctrl-btn${active ? ' active' : ''}${off ? ' off' : ''}`}
    title={label}
    style={{
      position: 'relative',
      ...(danger ? {
        background: 'linear-gradient(135deg,#C41C40,#FF4A6A)',
        border: 'none', color: '#fff',
        width: '80px', height: '42px',
        borderRadius: '10px', flexDirection: 'row', gap: '6px',
        fontSize: '14px', fontWeight: '700',
      } : {}),
    }}
  >
    {icon}
    {!danger && <span style={{ fontSize: '9px', lineHeight: 1 }}>{label}</span>}
    {danger && <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>{label}</span>}
    {badge > 0 && (
      <div style={{
        position: 'absolute', top: '-5px', right: '-5px',
        width: '18px', height: '18px',
        background: 'var(--red)', borderRadius: '50%',
        fontSize: '10px', fontWeight: '700',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
      }}>
        {badge > 9 ? '9+' : badge}
      </div>
    )}
  </button>
);

const MicIcon = ({ on }) => on
  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;

const CamIcon = ({ on }) => on
  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

export default function ControlBar({
  audioEnabled, videoEnabled, isScreenSharing,
  onToggleAudio, onToggleVideo, onScreenShare,
  onEnd, onRaiseHand, isStaff,
}) {
  const dispatch = useDispatch();
  const { activePanel, waitingList, messages, raisedHands } = useSelector(s => s.meeting);

  // Count genuinely unread messages
  const unreadCount = messages.filter(m => m._unread).length;

  return (
    <div className="control-bar">
      {/* Left: mic / cam */}
      <div className="control-group">
        <Btn icon={<MicIcon on={audioEnabled} />} label={audioEnabled ? 'Mute' : 'Unmute'} onClick={onToggleAudio} off={!audioEnabled} />
        <Btn icon={<CamIcon on={videoEnabled} />} label={videoEnabled ? 'Stop Video' : 'Start Video'} onClick={onToggleVideo} off={!videoEnabled} />
      </div>

      {/* Center: screen / chat / people / waiting / raise-hand */}
      <div className="control-group">
        <Btn
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/></svg>}
          label={isScreenSharing ? 'Stop Share' : 'Share'}
          onClick={onScreenShare}
          active={isScreenSharing}
        />
        <Btn
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>}
          label="Chat"
          onClick={() => dispatch(setActivePanel('chat'))}
          active={activePanel === 'chat'}
          badge={activePanel !== 'chat' ? unreadCount : 0}
        />
        <Btn
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}
          label="People"
          onClick={() => dispatch(setActivePanel('participants'))}
          active={activePanel === 'participants'}
        />
        {isStaff && (
          <Btn
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg>}
            label="Waiting"
            onClick={() => dispatch(setActivePanel('waiting'))}
            active={activePanel === 'waiting'}
            badge={waitingList.length}
          />
        )}
        {!isStaff && (
          <Btn
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 00-2-2v0a2 2 0 00-2 2v0"/><path d="M14 10V4a2 2 0 00-2-2v0a2 2 0 00-2 2v2"/><path d="M10 10.5V6a2 2 0 00-2-2v0a2 2 0 00-2 2v8"/><path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 012.83-2.82L7 15"/></svg>}
            label="Raise Hand"
            onClick={onRaiseHand}
            badge={raisedHands.length}
          />
        )}
      </div>

      {/* Right: end */}
      <div>
        <Btn icon={null} label={isStaff ? 'End' : 'Leave'} onClick={onEnd} danger />
      </div>
    </div>
  );
}
