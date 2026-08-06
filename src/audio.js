// SFX + music. New Audio element per one-shot (matches v1), with pitch jitter.

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
};

export const audioSettings = {
  musicVolume: 0.3,
  sfxVolume: 0.45,
  musicMode: 2, // 0 track A, 1 track B, 2 mix, 3 off
};

const TRACKS = [
  { label: "Final Match", src: "assets/music/The_Final_Match_Point.mp3" },
  { label: "Iron vs Bone", src: "assets/music/Iron_Versus_Bone.mp3" },
];

export const MUSIC_MODES = [
  { label: "Final Match", tracks: [0] },
  { label: "Iron vs Bone", tracks: [1] },
  { label: "Mix", tracks: [0, 1] },
  { label: "Off", tracks: [] },
];

let unlocked = false;
let playlistIndex = 0;
let musicEl = null;
let shieldLoop = null;
const active = new Set();

export function initAudio() {
  musicEl = document.getElementById("musicTrack");
  musicEl.addEventListener("ended", () => {
    const mode = MUSIC_MODES[audioSettings.musicMode];
    if (mode.tracks.length > 1) {
      playlistIndex = (playlistIndex + 1) % mode.tracks.length;
      musicEl.src = TRACKS[mode.tracks[playlistIndex]].src;
      musicEl.play().catch(() => {});
    }
  });
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function playSfx(name, intensity = 1, rate = 0) {
  if (!unlocked || audioSettings.sfxVolume <= 0) return;
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
  if (!unlocked || shieldLoop || audioSettings.sfxVolume <= 0) return;
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

export function syncMusic(phase) {
  if (!musicEl) return;
  const mode = MUSIC_MODES[audioSettings.musicMode];
  musicEl.volume = audioSettings.musicVolume;
  const shouldPlay = phase === "playing" && mode.tracks.length > 0 && audioSettings.musicVolume > 0;
  if (shouldPlay) {
    const desired = TRACKS[mode.tracks[playlistIndex % mode.tracks.length]].src;
    if (!musicEl.src.endsWith(desired)) musicEl.src = desired;
    musicEl.loop = mode.tracks.length === 1;
    musicEl.play().catch(() => {});
  } else {
    musicEl.pause();
  }
}

export function cycleMusicMode() {
  audioSettings.musicMode = (audioSettings.musicMode + 1) % MUSIC_MODES.length;
  playlistIndex = 0;
  return MUSIC_MODES[audioSettings.musicMode].label;
}
