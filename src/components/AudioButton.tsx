import { useState } from 'react';
import { speakText, stopSpeaking } from '../utils/tts';

interface Props { text: string; label?: string; }

export function AudioButton({ text, label = 'Écouter' }: Props) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (playing) { stopSpeaking(); setPlaying(false); return; }
    setLoading(true);
    await speakText(
      text,
      () => { setPlaying(true); setLoading(false); },
      () => { setPlaying(false); setLoading(false); },
      () => { setPlaying(false); setLoading(false); }
    );
  }

  return (
    <button onClick={handleClick} disabled={loading}
      style={{
        border: `1px solid ${playing ? '#e53935' : '#2563EB'}`,
        color: playing ? '#e53935' : '#2563EB',
        background: 'transparent',
        padding: '8px 20px',
        borderRadius: '4px',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '0.9em',
        opacity: loading ? 0.6 : 1,
        transition: 'all 0.3s',
      }}>
      {loading ? 'Chargement...' : playing ? 'Arrêter' : label}
    </button>
  );
}
