import { useEffect, useRef, useState } from 'react';

export function useRef_video(stream) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return ref;
}

export function useLocalMedia({ initOnMount = false } = {}) {
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error, setError] = useState(null);

  const initMedia = async ({ audio = true, video = true } = {}) => {
    try {
      // ALWAYS request both to get the tracks, so they can be toggled on later!
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      
      const aTrack = stream.getAudioTracks()[0];
      if (aTrack && !audio) aTrack.enabled = false;
      
      const vTrack = stream.getVideoTracks()[0];
      if (vTrack && !video) vTrack.enabled = false;

      setLocalStream(stream);
      setAudioEnabled(audio);
      setVideoEnabled(video);
      return stream;
    } catch (e) {
      // Try audio only
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        const aTrack = stream.getAudioTracks()[0];
        if (aTrack && !audio) aTrack.enabled = false;
        
        setLocalStream(stream);
        setAudioEnabled(audio);
        setVideoEnabled(false);
        return stream;
      } catch (e2) {
        setError('Could not access camera or microphone');
        return null;
      }
    }
  };

  const toggleAudio = () => {
    if (!localStream) return audioEnabled;
    const track = localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setAudioEnabled(track.enabled);
      return track.enabled;
    }
    return audioEnabled;
  };

  const toggleVideo = () => {
    if (!localStream) return videoEnabled;
    const track = localStream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setVideoEnabled(track.enabled);
      return track.enabled;
    }
    return videoEnabled;
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', cursor: 'always' },
        audio: false,
      });
      setScreenStream(stream);
      stream.getVideoTracks()[0].onended = () => {
        setScreenStream(null);
      };
      return stream;
    } catch {
      return null;
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    }
  };

  const stopAll = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setScreenStream(null);
  };

  return {
    localStream, screenStream, audioEnabled, videoEnabled, error,
    initMedia, toggleAudio, toggleVideo, startScreenShare, stopScreenShare, stopAll,
  };
}
