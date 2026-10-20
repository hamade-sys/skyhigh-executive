"use client";

/**
 * Game-show sound cues, synthesised with Web Audio — no audio files,
 * nothing to license. Browsers only allow sound after a user gesture,
 * so screens call `unlockSound()` from a click before anything plays.
 */

type Cue = "buzz" | "correct" | "wrong" | "timeUp" | "dailyDouble" | "join" | "tick" | "reveal" | "fanfare";

let ctx: AudioContext | null = null;

export function unlockSound(): boolean {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, gain = 0.18, endFreq?: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function play(cue: Cue) {
  if (!ctx || ctx.state !== "running") return;
  switch (cue) {
    case "buzz":
      tone(740, 0, 0.16, "square", 0.12);
      tone(988, 0.08, 0.2, "square", 0.1);
      break;
    case "correct":
      tone(523.25, 0, 0.14, "triangle");
      tone(659.25, 0.1, 0.14, "triangle");
      tone(783.99, 0.2, 0.3, "triangle", 0.2);
      break;
    case "wrong":
      tone(196, 0, 0.45, "sawtooth", 0.09, 150);
      break;
    case "timeUp":
      tone(880, 0, 0.12, "square", 0.08);
      tone(698.46, 0.16, 0.12, "square", 0.08);
      tone(523.25, 0.32, 0.3, "square", 0.08);
      break;
    case "dailyDouble":
      tone(300, 0, 0.6, "triangle", 0.16, 1200);
      tone(600, 0.15, 0.6, "sine", 0.1, 1800);
      break;
    case "join":
      tone(880, 0, 0.09, "sine", 0.1);
      tone(1318.5, 0.06, 0.12, "sine", 0.08);
      break;
    case "tick":
      tone(1200, 0, 0.04, "square", 0.05);
      break;
    case "reveal":
      tone(659.25, 0, 0.18, "sine", 0.12);
      tone(987.77, 0.12, 0.28, "sine", 0.12);
      break;
    case "fanfare":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.13, 0.35, "triangle", 0.16));
      tone(1046.5, 0.6, 0.7, "triangle", 0.18);
      break;
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
}
