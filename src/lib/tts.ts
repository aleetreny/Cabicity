let currentUtterance: SpeechSynthesisUtterance | null = null;

export function stopSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function speakText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  stopSpeech();
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
