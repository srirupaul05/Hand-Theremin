# Hand Theremin

Play music with your bare hands. Your webcam tracks both hands in the browser: your right hand sets the pitch, and each finger of your left hand plays its own instrument. Raise several fingers and the instruments layer into one piece of music.


## How to play

| Hand | Gesture | What it does |
|---|---|---|
| Right | Pinch thumb and index finger | Sets the pitch, from 0 to 500 Hz. Closed is silent, fully open is the highest note |
| Right | Raise or lower the whole hand | Higher means more reverb |
| Left | Raise a finger | Plays the instrument assigned to that finger |
| Left | Raise several fingers | Layers those instruments together |

Default fingers: thumb is bass, index is guitar, middle is drums, ring is piano, pinky is flute. Every finger has a dropdown, so you can put any instrument on any finger (guitar, drums, flute, bass, piano or cello).

Drums play whenever their finger is up. The other instruments need your right hand visible and the pinch open to make sound.

## Features

- Real-time hand and finger tracking in the browser with MediaPipe Hands. Nothing is uploaded; the video never leaves your computer.
- Six real instrument recordings (nylon guitar, electric bass, piano, flute, cello, and drum kits), played through Tone.js.
- Pitch snaps to a musical scale so layered instruments sound in tune. Choose minor pentatonic, major pentatonic, blues, major, chromatic, or free (no snapping), and pick the key.
- Three vibes that change the colours, tempo, scale, drum kit, amount of reverb and starting instruments: Neon, Temple and Ember.
- A glowing hand overlay, a pinch ring with a ribbon trail, and a live sound line across the screen.
- A record button that saves what you play as an audio file.

## Run it locally

The camera only works on `localhost` or `https`, so do not open `index.html` by double-clicking it.

1. Download or clone this repository.
2. Open the folder in VS Code and use the **Live Server** extension on `index.html`, or run this in the folder:
   ```
   python3 -m http.server 8000
   ```
   and open `http://localhost:8000`.
3. Use Chrome, press **Start camera and sound**, and allow camera access.

No build step and no installs. It is plain HTML, CSS and JavaScript.

## Tips for good tracking

- Use even lighting, with your hands in front of a plain background if you can.
- Keep both hands fully in the frame. Your left hand is the one on the left side of the screen.
- If a finger flickers, hold the gesture a moment longer. A finger has to stay in its new position for a few frames before it counts.

## Project structure

```
hand-theremin/
├── index.html           page layout and library script tags
├── css/
│   └── style.css        styling and theming
├── js/
│   ├── main.js          connects everything and draws the camera view
│   ├── tracking.js      hand tracking, pinch and finger detection
│   ├── audio.js         Tone.js engine: instruments, scales, reverb, recording
│   └── vibes.js         the Neon, Temple and Ember vibes
└── assets/
    └── samples/         instrument and drum recordings (mp3)
```

## How it works

1. The webcam image goes to MediaPipe Hands, which returns 21 landmark points for each hand.
2. The right hand's thumb-tip to index-tip distance, divided by palm size so distance from the camera does not matter, becomes a pitch from 0 to 500 Hz, snapped to the chosen scale.
3. For the left hand, a finger counts as raised when its tip is farther from the wrist than its middle joint, which works at any hand angle.
4. Tone.js plays each raised finger's instrument on a shared clock, so the rhythmic instruments stay in time with each other.

## Customising

- **Add or change a vibe:** edit `js/vibes.js`. Each vibe sets colours, tempo, scale, key, drum kit, reverb and default finger instruments.
- **Change the pitch range:** edit `MAX_FREQ` in `js/main.js`.
- **Change pinch sensitivity:** edit `PINCH_FULL` in `js/tracking.js`.
- **Add an instrument:** add recordings to `assets/samples/`, then add an entry to `INSTRUMENTS` and `SAMPLES` in `js/audio.js`.

## Vibe coded

This whole project was made by vibe coding: no code written by hand, just an idea, a lot of testing, and a lot of "that sounds weird, fix it". The idea went from "a webcam project with Tone.js" to a layered hand-played band, one conversation at a time.

Real bugs we hit along the way:

- The app froze whenever an open hand showed five fingers, because one tone name was not supported by the oscillator. One error stopped the whole camera loop.
- The first neon interface was so glowy that it slowed the browser to a crawl. The fix was cheaper glow and fewer blurs.
- The start button failed because the sample recordings were not in the project folder. The error message said exactly which file was missing.

Moral: describe the vibe, test everything, and paste the error text.

## Built with

- [Tone.js](https://tonejs.github.io/) for audio
- [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) for hand tracking
- Plain HTML, CSS and JavaScript (ES modules)
