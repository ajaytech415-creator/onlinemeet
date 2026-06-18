import { useSelector } from 'react-redux';
import VideoTile from './VideoTile';

export default function VideoGrid({ localStream, peerStreams, localUser, audioEnabled, videoEnabled, screenStream, remoteScreeners }) {
  const { viewMode, speakerSocketId } = useSelector(s => s.meeting);
  const peers = Object.entries(peerStreams || {});

  // Collect all tiles: screen share first, then local, then peers
  const allTiles = [];
  if (screenStream) {
    allTiles.push({ id: '__screen__', stream: screenStream, name: `${localUser?.name}'s Screen`, isLocal: true, isScreen: true, audio: true, video: true });
  }
  allTiles.push({ id: '__local__', stream: localStream, name: localUser?.name || 'You', isLocal: true, isScreen: false, audio: audioEnabled, video: videoEnabled });
  peers.forEach(([socketId, { stream, name }]) => {
    allTiles.push({ id: socketId, stream, name, isLocal: false, isScreen: remoteScreeners?.has(socketId), audio: true, video: true });
  });

  const total = allTiles.length;

  // ── Speaker View ─────────────────────────────────────────────────────────────
  // Active when: viewMode is 'speaker', OR there is any screen-sharing happening
  const isSpeakerView = viewMode === 'speaker' || !!screenStream || (remoteScreeners?.size > 0);

  if (isSpeakerView && total > 1) {
    // Determine the main (spotlight) tile
    const mainId = speakerSocketId && allTiles.find(t => t.id === speakerSocketId)
      ? speakerSocketId
      : (screenStream ? '__screen__' : (remoteScreeners?.size > 0 ? [...remoteScreeners][0] : allTiles[0].id));

    const mainTile = allTiles.find(t => t.id === mainId) || allTiles[0];
    const stripTiles = allTiles.filter(t => t.id !== mainTile.id);

    return (
      <div style={{ flex: 1, display: 'flex', gap: '6px', padding: '8px', background: '#030108', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
        {/* Main tile */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <VideoTile
            stream={mainTile.stream}
            name={mainTile.name}
            isLocal={mainTile.isLocal}
            audioEnabled={mainTile.audio}
            videoEnabled={mainTile.video}
            isScreenShare={mainTile.isScreen}
          />
        </div>

        {/* Side strip */}
        <div style={{ width: '180px', display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
          {stripTiles.map(tile => (
            <div key={tile.id} style={{ height: '120px', flexShrink: 0 }}>
              <VideoTile
                stream={tile.stream}
                name={tile.name}
                isLocal={tile.isLocal}
                audioEnabled={tile.audio}
                videoEnabled={tile.video}
                isScreenShare={tile.isScreen}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Gallery View ─────────────────────────────────────────────────────────────
  const getGridStyle = () => {
    if (total === 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
    if (total === 2) return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: '1fr' };
    if (total === 3) return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (total === 4) return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (total <= 6) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (total <= 9) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
    return { gridTemplateColumns: 'repeat(4, 1fr)' };
  };

  return (
    <div style={{ flex: 1, display: 'grid', gap: '6px', padding: '8px', background: '#030108', overflow: 'hidden', minHeight: 0, ...getGridStyle() }}>
      {allTiles.map((tile, i) => (
        <div
          key={tile.id}
          style={{
            minHeight: 0,
            // In a 3-tile layout, span first tile (screen share or local) across top
            ...(total === 3 && i === 0 ? { gridColumn: '1 / -1' } : {}),
          }}
        >
          <VideoTile
            stream={tile.stream}
            name={tile.name}
            isLocal={tile.isLocal}
            audioEnabled={tile.audio}
            videoEnabled={tile.video}
            isScreenShare={tile.isScreen}
          />
        </div>
      ))}
    </div>
  );
}
