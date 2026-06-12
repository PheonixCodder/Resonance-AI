import { auth } from "@clerk/nextjs/server";
import { getSignedAudioUrl } from "@/lib/r2";
import prisma from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ voiceId: string }> },
) {
  const { voiceId } = await params;
  const logPrefix = `[api/voices/${voiceId}]`;

  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      console.warn(`${logPrefix} unauthorized`, { userId, orgId });
      return new Response("Unauthorized", { status: 401 });
    }

    console.log(`${logPrefix} auth ok`, { userId, orgId });

    const voice = await prisma.voice.findUnique({
      where: { id: voiceId },
      select: {
        variant: true,
        orgId: true,
        r2ObjectKey: true,
      },
    });

    if (!voice) {
      console.warn(`${logPrefix} voice not found in database`);
      return new Response("Not found", { status: 404 });
    }

    console.log(`${logPrefix} voice record`, voice);

    if (voice.variant === "CUSTOM" && voice.orgId !== orgId) {
      console.warn(`${logPrefix} custom voice org mismatch`, {
        voiceOrgId: voice.orgId,
        requestOrgId: orgId,
      });
      return new Response("Not found", { status: 404 });
    }

    if (!voice.r2ObjectKey) {
      console.warn(`${logPrefix} voice has no r2ObjectKey`);
      return new Response("Voice audio is not available yet", { status: 409 });
    }

    const signedUrl = await getSignedAudioUrl(voice.r2ObjectKey);
    const parsedSignedUrl = new URL(signedUrl);

    console.log(`${logPrefix} signed url generated`, {
      r2ObjectKey: voice.r2ObjectKey,
      host: parsedSignedUrl.host,
      pathname: parsedSignedUrl.pathname,
      hasQuery: parsedSignedUrl.search.length > 0,
    });

    const audioResponse = await fetch(signedUrl);

    console.log(`${logPrefix} storage fetch response`, {
      status: audioResponse.status,
      statusText: audioResponse.statusText,
      contentType: audioResponse.headers.get("content-type"),
      contentLength: audioResponse.headers.get("content-length"),
    });

    if (!audioResponse.ok) {
      const errorBody = await audioResponse.text();

      console.error(`${logPrefix} storage fetch failed (502)`, {
        r2ObjectKey: voice.r2ObjectKey,
        status: audioResponse.status,
        statusText: audioResponse.statusText,
        bodyPreview: errorBody.slice(0, 500),
      });

      return new Response("Failed to fetch voice audio", { status: 502 });
    }

    const contentType =
      audioResponse.headers.get("content-type") || "audio/wav";

    console.log(`${logPrefix} success`, { contentType });

    return new Response(audioResponse.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          voice.variant === "SYSTEM"
            ? "public, max-age=86400"
            : "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error(`${logPrefix} unexpected error`, error);
    return new Response("Internal server error", { status: 500 });
  }
}
