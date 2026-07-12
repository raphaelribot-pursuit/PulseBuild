/**
 * Cloud Voice Adapter (ElevenLabs)
 * Post-Phase-8 addition, sits alongside lib/voiceAdapter.ts's browser
 * SpeechSynthesis path as a second, opt-in provider. See useUIStore's
 * `voiceProvider` for the switch between the two.
 *
 * Unlike speechSynthesis.speak(), which natively queues repeated calls,
 * an <audio> element has no built-in queue — calling .play() on a new
 * element while another is still playing just overlaps them, i.e. the
 * exact "colliding alerts" bug already fixed once for the browser path.
 * So this file keeps its own small sequential queue rather than
 * reproducing that bug for the cloud path.
 *
 * Deliberately NOT unit-tested here (matches the existing browser-only
 * speak()/stopSpeech() in voiceAdapter.ts) — everything below touches
 * fetch + <audio>, both meaningfully unmockable in a way that would give
 * real confidence in vitest's jsdom-less environment. Flagged as the same
 * class of coverage gap noted for the browser voice path.
 */

type QueueItem = { text: string };

let queue: QueueItem[] = [];
let currentAudio: HTMLAudioElement | null = null;
let isProcessing = false;
let unlocked = false;

/** Browsers (Safari and Chrome both) block `<audio>`.play() unless it's
 * triggered directly by a user gesture (a click) — unlike
 * speechSynthesis, which is exempt from this policy. Since voice alerts
 * fire from the simulation's timer, not a click, every play() call was
 * being silently rejected with "not allowed by the user agent," and our
 * error handling correctly reported that once surfaced, but there was no
 * fix yet.
 *
 * The standard workaround: play a near-silent, near-zero-length clip
 * during a REAL click the user already makes elsewhere in the app (Start
 * Simulation). Browsers then treat that <audio> element/session as
 * "unlocked" for the rest of the page's lifetime, so later timer-driven
 * play() calls succeed without needing their own gesture. Call this from
 * the Start Simulation button's onClick. Safe to call more than once. */
export function unlockAudio(): void {
  if (unlocked) return;
  if (typeof window === "undefined") return;

  const silence =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  const audio = new Audio(silence);
  audio
    .play()
    .then(() => {
      unlocked = true;
    })
    .catch(() => {
      // If this itself gets rejected, the calling click wasn't
      // considered a valid gesture by the browser (rare) — leave
      // `unlocked` false so we keep trying on subsequent gestures rather
      // than assuming success.
    });
}
/** Resolver for whichever clip is currently awaited in processQueue's
 * loop. Needed because pausing an <audio> element does NOT fire
 * 'onended' — only reaching the end naturally does — so without this,
 * stopCloudSpeech() pausing playback would leave that await hanging
 * forever and silently stall the queue for the rest of the session. */
let pendingResolve: (() => void) | null = null;

/** Called by the caller (VoiceEngine) when a cloud fetch/playback fails,
 * so it can fall back to the browser voice for that alert instead of the
 * demo going silent. Not called automatically from inside this module —
 * keeping the fallback decision in VoiceEngine keeps this file's own
 * responsibility limited to "play things in order." */
export type CloudSpeakErrorHandler = (text: string, error: Error) => void;

async function processQueue(onError?: CloudSpeakErrorHandler): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const item = queue.shift()!;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown TTS error" }));
        throw new Error(body.error || `TTS request failed (${res.status})`);
      }

      // Rebuild the blob with an explicit MIME type rather than trusting
      // res.blob() to infer it from the response's Transfer-Encoding:
      // chunked framing. Safari in particular can produce a blob whose
      // type doesn't come through cleanly that way, and will then refuse
      // to play it via <audio> with no useful error — silence with
      // nothing in the console, which is exactly what was happening here.
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;

      await new Promise<void>((resolve) => {
        pendingResolve = resolve;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          pendingResolve = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          pendingResolve = null;
          // Previously swallowed silently — no onError call, no log,
          // just quiet failure. MediaError carries a numeric `code`
          // (1=aborted, 2=network, 3=decode, 4=src not supported) which
          // is the most useful thing we can surface here.
          const mediaError = audio.error;
          onError?.(
            item.text,
            new Error(
              `Audio playback failed${mediaError ? ` (MediaError code ${mediaError.code})` : ""}`
            )
          );
          resolve(); // still don't let one bad clip stall the rest of the queue
        };
        audio.play().catch((playErr) => {
          pendingResolve = null;
          onError?.(item.text, playErr instanceof Error ? playErr : new Error(String(playErr)));
          resolve();
        });
      });

      currentAudio = null;
    } catch (err) {
      onError?.(item.text, err instanceof Error ? err : new Error(String(err)));
    }
  }

  isProcessing = false;
}

/** Real-time check of whether the cloud queue has anything playing or
 * waiting — true from the moment something is enqueued until the queue
 * fully drains. Used by the simulation's pacing logic to wait for ACTUAL
 * completion instead of a word-count estimate, which can't account for
 * ElevenLabs' network fetch/generation latency before playback even
 * starts. */
export function isCloudSpeaking(): boolean {
  return isProcessing || queue.length > 0;
}

/** Enqueue text to be spoken via ElevenLabs, in order, after anything
 * already queued/playing finishes. Mirrors voiceAdapter.speak()'s
 * signature shape (text in, fire-and-forget) so VoiceEngine can switch
 * providers without restructuring its call site. */
export function speakCloud(text: string, onError?: CloudSpeakErrorHandler): void {
  queue.push({ text });
  void processQueue(onError);
}

/** Explicit, intentional interrupt — used for mute and simulation reset,
 * mirroring voiceAdapter.stopSpeech()'s contract exactly: drop anything
 * queued/playing immediately. */
export function stopCloudSpeech(): void {
  queue = [];
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  // Force-resolve the in-flight await from processQueue's loop — pausing
  // alone would never trigger it (see note on pendingResolve above),
  // which would otherwise leave isProcessing stuck true and the queue
  // permanently stalled after the first stop.
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve();
  }
}
