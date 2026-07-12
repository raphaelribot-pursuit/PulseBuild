import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/tts
 * Post-Phase-8 addition: cloud TTS via ElevenLabs, as an alternative to
 * the browser SpeechSynthesis path in lib/voiceAdapter.ts. Same boundary
 * rule as /api/chat/route.ts — the API key is server-only and never sent
 * to the client. The client (lib/cloudVoiceAdapter.ts) posts { text } and
 * gets back a raw audio/mpeg stream it plays via an <audio> element.
 *
 * Why a separate route instead of extending /api/chat: this returns
 * binary audio, not JSON — different response contract, worth keeping
 * isolated so neither route's error handling has to branch on shape.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ELEVENLABS_API_KEY is not set. Copy .env.local.example to .env.local, add your key, and restart the dev server.",
      },
      { status: 500 }
    );
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.text || !body.text.trim()) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }

  // Default voice: the user's own ElevenLabs account voice. Free-tier
  // accounts cannot use Voice Library IDs via the API (402
  // paid_plan_required) — only voices already attached to the account
  // work, hence this being a real voice ID rather than a library preset.
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "AuFA9tJJ61bISCCJLCmE";
  // eleven_turbo_v2_5: lowest latency/cheapest-per-character model that
  // still sounds natural — the right tradeoff for a live demo on a free
  // tier's limited monthly credits, vs. the highest-fidelity model.
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: body.text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      // Free-tier accounts commonly hit this mid-demo (monthly character
      // quota exhausted) — surface it plainly so the client's fallback
      // logic (see cloudVoiceAdapter.ts) can drop back to browser voices
      // instead of silently going quiet.
      return NextResponse.json(
        { error: `ElevenLabs API error (${response.status}): ${errText}` },
        { status: 502 }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach ElevenLabs API: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
