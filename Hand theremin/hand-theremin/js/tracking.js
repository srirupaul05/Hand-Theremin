// MediaPipe Hands setup and gesture math.
// Hands and Camera are loaded as globals from the script tags in index.html.

const PINCH_FULL = 1.1; 

export function dist(a, b, aspect) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

export function pinchAmount(lm, aspect) {
  const palm = dist(lm[0], lm[9], aspect);
  const ratio = dist(lm[4], lm[8], aspect) / palm;
  return Math.min(Math.max(ratio / PINCH_FULL, 0), 1);
}

export function fingerStates(lm, aspect) {
  const wrist = lm[0];
  const thumb = dist(lm[4], lm[17], aspect) > dist(lm[3], lm[17], aspect) * 1.1;
  const others = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].map(
    ([tip, pip]) =>
      dist(lm[tip], wrist, aspect) > dist(lm[pip], wrist, aspect) * 1.1,
  );
  return [thumb, ...others];
}

export async function startTracking(video, onResults) {
  const hands = new Hands({
    locateFile: (f) =>
      "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/" + f,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0, // lite model: much faster, still accurate enough for pinch and fingers
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
    selfieMode: true, // mirrors the image so Left and Right match your real hands
  });

  // Safety net: if anything goes wrong while handling one frame, log it and keep running.
  hands.onResults((results) => {
    try {
      onResults(results);
    } catch (err) {
      console.error("Frame error:", err);
    }
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      try {
        await hands.send({ image: video });
      } catch (err) {
        console.error("Tracking error:", err);
      }
    },
    width: 640,
    height: 360,
  });
  await camera.start();
}
