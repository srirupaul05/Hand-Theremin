# Hand Theremin

Play music with your hands. Right hand: pinch thumb and index for pitch, raise the hand for more reverb.
Left hand: each finger plays its own instrument, and fingers layer together.

## Run it
Open this folder in VS Code and use the Live Server extension on `index.html`
(or run `python3 -m http.server 8000` and open http://localhost:8000). The camera needs localhost or https.

## Files
- `index.html`        page layout and library script tags
- `css/style.css`     styling
- `js/main.js`        wires everything together, draws the camera view
- `js/tracking.js`    MediaPipe hand tracking and finger and pinch detection
- `js/audio.js`       Tone.js sound engine (instruments, scales, reverb, recording)
- `js/vibes.js`       the Neon, Temple and Ember vibes (colours, tempo, scale, kit)
- `assets/samples/`   instrument and drum recordings

## Credits
Instrument samples come from the tonejs-instruments project (nbrosowsky) and drum samples from Tone.js's audio repository.
Check those projects' licences before publishing this online.
