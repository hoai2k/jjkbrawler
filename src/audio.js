// SFX + music. New Audio element per one-shot (matches v1), with pitch jitter.
//
// Music has two layers: menu screens play one fixed track quietly, and a match
// plays its stage's own track where one exists, falling back to a random pick
// from the originals. Which files exist is declared in config_music.js.

import { STAGES } from "./stages.js";
import {
  BOARD_MUSIC_DIR, BOARD_TRACKS, FALLBACK_TRACKS, MENU_TRACK, MUSIC_DIR, MUSIC_EXT,
  MUSIC_MODES as MUSIC_MODE_CONFIG, UNUSED_BOARD_TRACKS,
} from "./config_music.js";

const SFX_FILES = {
  blast: "assets/sfx/sound_explosion.wav",
  block: "assets/sfx/sound_sword_hit.mp3",
  slash: "assets/sfx/sound_sword_hit2.mp3",
  slashHeavy: "assets/sfx/sound_sword_hit3.mp3",
  miss: "assets/sfx/sound_miss.mp3",
  punch: "assets/sfx/sound_punch.mp3",
  landing: "assets/sfx/sound_landing.wav",
  gone: "assets/sfx/sound_gone.mp3",
  shield: "assets/sfx/sound_shield.mp3",
  whoosh: "assets/sfx/sound_whoosh.mp3",
  ult: "assets/sfx/sound_blast_3.mp3",
  gruntAnimal: "assets/sfx/sound_grunt_animal.mp3",
  gruntBig: "assets/sfx/sound_grunt_big.mp3",
  gruntFemale: "assets/sfx/sound_grunt_female.mp3",
  gruntMonster: "assets/sfx/sound_grunt_monster.mp3",
};

const SFX_START = { landing: 0.03, whoosh: 0.2 };

const GRUNT_GROUPS = {
  maki: "gruntFemale", momo: "gruntFemale", nobara: "gruntFemale",
  jogo: "gruntMonster", hanami: "gruntMonster",
  panda: "gruntAnimal", mahito: "gruntAnimal",
  hakari: "gruntBig", todo: "gruntBig", sukuna: "gruntBig",
  // round-7 staged fighters
  meimei: "gruntFemale", uro: "gruntFemale",
  choso: "gruntBig", gakuganji: "gruntBig",
};

export const audioSettings = {
  // Master mute from the toolbar. Independent of the volume sliders, so
  // unmuting restores whatever levels were set rather than resetting them.
  muted: false,
  musicVolume: 0.3,
  sfxVolume: 0.45,
  musicMode: 0, // index into MUSIC_MODES below; 0 is per-stage music
};

// Filenames carry spaces, so every src is encoded before it reaches the element.
const trackUrl = (dir, file) => encodeURI(`${dir}${file}${MUSIC_EXT}`);
const MENU_SRC = trackUrl(MUSIC_DIR, MENU_TRACK.file);
const FALLBACK_SRCS = FALLBACK_TRACKS.map((t) => trackUrl(MUSIC_DIR, t.file));
const BOARD_TRACK_SET = new Set(BOARD_TRACKS);

// Menu screens share one track; "playing" gets the battle track; loading and
// pause stay silent (pause holds the match track rather than switching away).
const MENU_PHASES = new Set(["menu", "stageSelect", "moves", "settings", "roundOver"]);

// Default: the stage's own track. Random: anything in the library, board tracks
// and originals alike, drawn fresh per match. Off: silence everywhere.
export const MUSIC_MODES = MUSIC_MODE_CONFIG;

// Everything Random can land on.
const ALL_BATTLE_SRCS = [
  ...BOARD_TRACKS.map((name) => trackUrl(BOARD_MUSIC_DIR, name)),
  ...FALLBACK_SRCS,
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// A stage name in BOARD_TRACKS that matches no stage would silently never play,
// and a track file whose name has a typo looks exactly the same. Say so.
function validateMusicConfig() {
  const stageNames = new Set(STAGES.map((s) => s.name));
  const unmatched = BOARD_TRACKS.filter((name) => !stageNames.has(name));
  if (unmatched.length) {
    console.warn(
      `config_music.js BOARD_TRACKS names no such stage (typo?): ${unmatched.join(", ")}`
    );
  }
  const overlap = UNUSED_BOARD_TRACKS.filter((name) => stageNames.has(name));
  if (overlap.length) {
    console.warn(
      `config_music.js lists these as unused but they are real stages: ${overlap.join(", ")}`
    );
  }
}
validateMusicConfig();

let unlocked = false;
let musicEl = null;
let battleSrc = null;   // resolved once per match so it cannot re-roll mid-fight
let battleStageKey = null;
let currentSrc = null;
let shieldLoop = null;
const active = new Set();

export function initAudio() {
  musicEl = document.getElementById("musicTrack");
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function playSfx(name, intensity = 1, rate = 0) {
  if (!unlocked || audioSettings.muted || audioSettings.sfxVolume <= 0) return;
  const src = SFX_FILES[name];
  if (!src) return;
  if (active.size > 24) return; // safety valve
  const el = new Audio(src);
  el.volume = Math.min(1, audioSettings.sfxVolume * intensity);
  el.playbackRate = rate || 0.96 + Math.random() * 0.08;
  if (SFX_START[name]) el.currentTime = SFX_START[name];
  active.add(el);
  const drop = () => active.delete(el);
  el.addEventListener("ended", drop);
  el.addEventListener("error", drop);
  setTimeout(drop, 6000); // stalled elements must not clog the voice cap
  el.play().catch(drop);
}

export function playGrunt(charKey) {
  const group = GRUNT_GROUPS[charKey];
  if (group) playSfx(group, 0.9);
}

export function startShieldLoop() {
  if (!unlocked || shieldLoop || audioSettings.muted || audioSettings.sfxVolume <= 0) return;
  shieldLoop = new Audio(SFX_FILES.shield);
  shieldLoop.volume = Math.min(1, audioSettings.sfxVolume * 0.6);
  shieldLoop.loop = true;
  shieldLoop.play().catch(() => { shieldLoop = null; });
}

export function stopShieldLoop() {
  if (shieldLoop) {
    shieldLoop.pause();
    shieldLoop = null;
  }
}

// The battle track for a match, by mode: the stage's own track (falling back to
// a random original if that stage has none), anything in the library, or none.
function resolveBattleSrc(stageKey) {
  const mode = MUSIC_MODES[audioSettings.musicMode] || MUSIC_MODES[0];
  if (mode.key === "off") return null;
  if (mode.key === "random") return pick(ALL_BATTLE_SRCS);
  const stage = STAGES.find((s) => s.key === stageKey);
  if (stage && BOARD_TRACK_SET.has(stage.name)) return trackUrl(BOARD_MUSIC_DIR, stage.name);
  return pick(FALLBACK_SRCS);
}

// Called when a match starts. Re-rolls the fallback, so a rematch on a stage
// without its own track can come up with the other original.
export function setBattleStage(stageKey) {
  battleStageKey = stageKey;
  battleSrc = resolveBattleSrc(stageKey);
}

export function syncMusic(phase) {
  if (!musicEl) return;
  const menu = MENU_PHASES.has(phase);
  const src = phase === "playing" ? battleSrc : menu ? MENU_SRC : null;
  const off = (MUSIC_MODES[audioSettings.musicMode] || MUSIC_MODES[0]).key === "off";
  const volume = audioSettings.musicVolume * (menu ? MENU_TRACK.volumeScale : 1);

  if (!src || off || audioSettings.muted || audioSettings.musicVolume <= 0) {
    musicEl.pause();
    return;
  }
  musicEl.volume = Math.min(1, volume);
  if (currentSrc !== src) {
    currentSrc = src;
    musicEl.src = src;
  }
  musicEl.loop = true;
  musicEl.play().catch(() => {});
}

// Toolbar mute. Returns the new state so the caller can repaint its icon.
export function toggleMute() {
  audioSettings.muted = !audioSettings.muted;
  if (audioSettings.muted) stopShieldLoop();
  return audioSettings.muted;
}

export function cycleMusicMode() {
  audioSettings.musicMode = (audioSettings.musicMode + 1) % MUSIC_MODES.length;
  // An explicit choice takes effect on the current match, not just the next one.
  battleSrc = resolveBattleSrc(battleStageKey);
  return MUSIC_MODES[audioSettings.musicMode].label;
}
