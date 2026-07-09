import { callGeminiProxy } from '../lib/geminiProxy';

let currentAudio: HTMLAudioElement | null = null;
let isPlaying = false;

function detectLanguage(text: string): string {
  return /[؀-ۿ]/.test(text) ? 'ar' : 'fr';
}

function getVoiceName(lang: string): string {
  return lang === 'ar' ? 'Scheherazade' : 'Charon';
}

function cleanTextForTTS(text: string): string {
  return text
    .replace(/——— ✦ ———/g, '. ')
    .replace(/✦/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 4000);
}

export async function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: () => void
): Promise<void> {
  stopSpeaking();
  const lang = detectLanguage(text);
  const cleanText = cleanTextForTTS(text);
  if (!cleanText) { onError?.(); return; }

  try {
    const data = await callGeminiProxy('gemini-2.5-flash-preview-tts', {
      contents: [{ parts: [{ text: cleanText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: getVoiceName(lang) }
          }
        }
      }
    });
    const audioPart = data?.candidates?.[0]?.content?.parts?.[0];
    if (!audioPart?.inlineData?.data) throw new Error('Pas de données audio');

    const audio = new Audio(`data:${audioPart.inlineData.mimeType || 'audio/wav'};base64,${audioPart.inlineData.data}`);
    currentAudio = audio;
    audio.onplay = () => { isPlaying = true; onStart?.(); };
    audio.onended = () => { isPlaying = false; currentAudio = null; onEnd?.(); };
    audio.onerror = () => { isPlaying = false; currentAudio = null; onError?.(); };
    await audio.play();
  } catch (error) {
    isPlaying = false;
    currentAudio = null;
    onError?.();
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  isPlaying = false;
}

export const getIsPlaying = (): boolean => isPlaying;
