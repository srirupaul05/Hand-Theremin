// Tone.js sound engine: one real instrument per left-hand finger, all able to play at once.
// Tone is loaded as a global from the script tag in index.html.
//
// How your right-hand pitch reaches each instrument:
//   Flute, Cello          a note that follows your pinch (re-played when the note changes)
//   Guitar, Piano, Bass   notes played in rhythm at your current pinch pitch
//   Drums                 a beat that plays whenever its finger is up (no pitch needed)

export const INSTRUMENTS = [
  { id: "guitar", name: "Guitar" },
  { id: "drums", name: "Drums" },
  { id: "flute", name: "Flute" },
  { id: "bass", name: "Bass" },
  { id: "keys", name: "Piano" },
  { id: "strings", name: "Cello" },
];

// Scales as semitone steps above the key. "free" keeps the raw pitch.
export const SCALES = {
  free: null,
  minpent: [0, 3, 5, 7, 10],
  majpent: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const MIN_AUDIBLE = 15; // Hz, below this the pitched instruments are silent

// Real recordings stored in assets/samples (notes marked "s" are sharps, so As1 is A#1).
const SAMPLE_DIR = "assets/samples/";
const SAMPLES = {
  guitar: {
    dir: "guitar",
    notes: ["E2", "A2", "D3", "G3", "B3", "E4", "A4", "D5"],
    release: 1.2,
    volume: -2,
  },
  bass: {
    dir: "bass",
    notes: ["E1", "As1", "E2", "As2", "E3", "G3"],
    release: 0.4,
    volume: 0,
  },
  keys: {
    dir: "piano",
    notes: ["A2", "C3", "Fs3", "C4", "Fs4", "A4", "C5"],
    release: 1.2,
    volume: -3,
  },
  flute: {
    dir: "flute",
    notes: ["C4", "E4", "A4", "C5", "E5", "A5"],
    release: 0.5,
    attack: 0.04,
    volume: -1,
  },
  strings: {
    dir: "cello",
    notes: ["A2", "D3", "A3", "D4", "A4"],
    release: 0.9,
    attack: 0.12,
    volume: -3,
  },
};
const KITS = { techno: "Techno", acoustic: "acoustic-kit", linn: "LINN" };

function makeSampler(cfg, out) {
  const urls = {};
  for (const n of cfg.notes) urls[n.replace("s", "#")] = n + ".mp3";
  const sampler = new Tone.Sampler({
    urls,
    baseUrl: SAMPLE_DIR + cfg.dir + "/",
    release: cfg.release,
    attack: cfg.attack || 0,
  });
  sampler.volume.value = cfg.volume;
  sampler.connect(out);
  return sampler;
}

export class ThereminAudio {
  constructor() {
    this.volume = 0.6;
    this.master = null;
    this.wave = null;
    this.voices = {};
    this.kits = {};
    this.want = new Set(); // instruments whose finger is currently up
    this.freq = 0;
    this.audible = false;
    this.step = 0;
    this.started = false;
    this.scale = "minpent"; // snap pitch to a musical scale ("free" = no snapping)
    this.root = 9; // key as a pitch class, 0 = C ... 9 = A
    this.bpm = 108;
    this.kit = "techno";
    this.spaceMax = 0.7; // most reverb you can get
    this.reverb = null;
    this.recorder = null;
  }

  // Must be called from a user click, because browsers block audio until then.
  async start() {
    await Tone.start();

    this.master = new Tone.Gain(this.volume);
    this.reverb = new Tone.Reverb({ decay: 3.5, wet: 0 }); // amount follows your right hand's height
    await this.reverb.generate();
    const limiter = new Tone.Limiter(-2); // keeps several instruments at once from clipping
    this.wave = new Tone.Waveform(512);
    this.recorder = new Tone.Recorder();
    this.master.connect(this.reverb);
    this.reverb.connect(limiter);
    limiter.toDestination();
    limiter.connect(this.wave);
    limiter.connect(this.recorder);

    const out = this.master;
    const phrase = (sampler) => ({
      sampler,
      held: false,
      key: null,
      note: 0,
      t: 0,
    });

    this.voices = {
      guitar: makeSampler(SAMPLES.guitar, out),
      bass: makeSampler(SAMPLES.bass, out),
      keys: makeSampler(SAMPLES.keys, out),
      flute: phrase(makeSampler(SAMPLES.flute, out)),
      strings: phrase(makeSampler(SAMPLES.strings, out)),
    };

    // Drum kits (the vibe picks which one plays)
    for (const [id, folder] of Object.entries(KITS)) {
      const kit = new Tone.Players({
        urls: { kick: "kick.mp3", snare: "snare.mp3", hihat: "hihat.mp3" },
        baseUrl: SAMPLE_DIR + "drums/" + folder + "/",
      });
      kit.player("kick").volume.value = 0;
      kit.player("snare").volume.value = -3;
      kit.player("hihat").volume.value = -9;
      kit.connect(out);
      this.kits[id] = kit;
    }

    await Tone.loaded(); // wait for every recording to download

    // One shared clock keeps every rhythmic instrument in time with each other.
    Tone.Transport.bpm.value = this.bpm;
    Tone.Transport.scheduleRepeat((time) => this.tick(time), "16n");
    Tone.Transport.start();

    this.started = true;
  }

  // Runs on every 16th note.
  tick(time) {
    const s = this.step % 16;
    this.step++;
    const v = this.voices;
    const f = this.freq;

    if (this.want.has("drums")) {
      const kit = this.kits[this.kit];
      if (s === 0 || s === 8 || s === 10) kit.player("kick").start(time);
      if (s === 4 || s === 12) kit.player("snare").start(time);
      if (s % 2 === 0) kit.player("hihat").start(time);
    }

    if (!this.audible) return;

    if (this.want.has("guitar") && s % 2 === 0) {
      v.guitar.triggerAttack(Math.max(f, 82), time, s % 4 === 0 ? 0.9 : 0.55);
    }
    if (this.want.has("bass") && s % 4 === 0) {
      v.bass.triggerAttackRelease(Math.max(f * 0.5, 41), "8n", time);
    }
    if (this.want.has("keys") && s % 4 === 2) {
      v.keys.triggerAttackRelease(Math.max(f, 110), "8n", time);
    }
  }

  // Called on every camera frame.
  //   active   Set of instrument ids whose finger is up
  //   freq     pitch from the right hand, 0 to 500 Hz
  //   hasPitch true while the right hand is visible
  update(active, freq, hasPitch) {
    this.want = active;
    this.audible = hasPitch && freq >= MIN_AUDIBLE;
    this.freq = this.snap(freq);
    if (!this.started) return;

    // Flute and cello: play a note, and play a new one when your pitch moves to a different note.
    const now = performance.now();
    for (const id of ["flute", "strings"]) {
      const voice = this.voices[id];
      const on = active.has(id) && this.audible;
      const note = id === "flute" ? this.freq * 2 : Math.max(this.freq, 65);
      if (on) {
        const key = Math.round(12 * Math.log2(note / 440));
        const changed = key !== voice.key && now - voice.t > 120;
        const stale = now - voice.t > 1800; // the recording runs out, so play it again
        if (!voice.held || changed || stale) {
          if (voice.held && changed) voice.sampler.triggerRelease(voice.note); // old note fades out
          voice.sampler.triggerAttack(note, undefined, 0.8);
          voice.held = true;
          voice.key = key;
          voice.note = note;
          voice.t = now;
        }
      } else if (voice.held) {
        voice.sampler.triggerRelease(voice.note);
        voice.held = false;
      }
    }
  }

  // Move a frequency to the nearest note of the chosen scale.
  snap(freq) {
    const steps = SCALES[this.scale];
    if (!steps || freq < MIN_AUDIBLE) return freq;
    const midi = 69 + 12 * Math.log2(freq / 440);
    let best = Math.round(midi);
    let bestDiff = Infinity;
    for (let m = Math.floor(midi) - 6; m <= Math.ceil(midi) + 6; m++) {
      const pitchClass = (((m - this.root) % 12) + 12) % 12;
      if (!steps.includes(pitchClass)) continue;
      const diff = Math.abs(m - midi);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = m;
      }
    }
    return 440 * Math.pow(2, (best - 69) / 12);
  }

  setScale(name) {
    this.scale = name;
  }
  setRoot(pitchClass) {
    this.root = pitchClass;
  }

  // Applies a vibe from vibes.js: tempo, drum kit and how much reverb is available.
  setVibe(vibe) {
    this.bpm = vibe.bpm;
    this.kit = vibe.kit;
    this.spaceMax = vibe.space;
    if (this.started) Tone.Transport.bpm.rampTo(vibe.bpm, 0.3);
  }

  // 0 to 1: how much reverb to add
  setSpace(amount) {
    if (this.reverb)
      this.reverb.wet.rampTo(
        Math.min(Math.max(amount, 0), 1) * this.spaceMax,
        0.1,
      );
  }

  startRecording() {
    if (this.recorder) this.recorder.start();
  }

  async stopRecording() {
    return this.recorder ? await this.recorder.stop() : null;
  }

  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.rampTo(value, 0.05);
  }

  getWaveform() {
    return this.wave ? this.wave.getValue() : null;
  }
}
