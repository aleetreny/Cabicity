let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let currentElevenLabsAbort: AbortController | null = null;

const ELEVENLABS_VOICE_ID = "0yjozmPXw5c7i43fUMkY";
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const ELEVENLABS_KEY_STORAGE = "ct-elevenlabs-api-key";

function revokeAudioUrl() {
  if (!currentAudioUrl) return;
  URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = null;
}

function getLocalElevenLabsKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const key = localStorage.getItem(ELEVENLABS_KEY_STORAGE);
    return key?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getProxyUrl(): string | undefined {
  const env = (import.meta.env as Record<string, string | undefined>) || {};
  const url = env.VITE_ELEVENLABS_PROXY_URL;
  return url?.trim() || undefined;
}

async function fetchAudioBlob(text: string, signal: AbortSignal): Promise<Blob | null> {
  const cleanText = text.slice(0, 1000);
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: cleanText,
        voiceId: ELEVENLABS_VOICE_ID,
        modelId: ELEVENLABS_MODEL_ID,
      }),
      signal,
    });
    return res.ok ? res.blob() : null;
  }

  const apiKey = getLocalElevenLabsKey();
  if (!apiKey) return null;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.82,
          style: 0.45,
          use_speaker_boost: true,
        },
      }),
      signal,
    },
  );
  return res.ok ? res.blob() : null;
}

function speakNative(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 1000));
  utterance.lang = "es-ES";
  utterance.rate = 1;
  utterance.pitch = 1;

  const spanishVoice = window.speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith("es"));
  if (spanishVoice) utterance.voice = spanishVoice;

  utterance.onend = () => {
    if (currentUtterance === utterance) currentUtterance = null;
  };
  utterance.onerror = utterance.onend;
  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech() {
  currentElevenLabsAbort?.abort();
  currentElevenLabsAbort = null;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  revokeAudioUrl();

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}

export function speakText(text: string) {
  if (typeof window === "undefined") return;

  stopSpeech();
  const ctrl = new AbortController();
  currentElevenLabsAbort = ctrl;

  fetchAudioBlob(text, ctrl.signal)
    .then((blob) => {
      if (ctrl.signal.aborted) return;
      currentElevenLabsAbort = null;
      if (!blob || typeof Audio === "undefined") {
        speakNative(text);
        return;
      }

      const url = URL.createObjectURL(blob);
      currentAudioUrl = url;
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        revokeAudioUrl();
      };
      audio.onerror = () => {
        if (currentAudio === audio) currentAudio = null;
        revokeAudioUrl();
        speakNative(text);
      };
      void audio.play().catch(() => {
        if (currentAudio === audio) currentAudio = null;
        revokeAudioUrl();
        speakNative(text);
      });
    })
    .catch(() => {
      if (!ctrl.signal.aborted) {
        currentElevenLabsAbort = null;
        speakNative(text);
      }
    });
}
