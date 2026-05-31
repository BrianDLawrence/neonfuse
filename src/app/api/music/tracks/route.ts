import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { musicTrackSchema } from "@/lib/schemas/music";

// Custom tracks live in the "music-tracks" collection. The built-in tracks are
// served from code (src/audio/musicTracks.ts), so this endpoint only carries the
// user-added ones; the Music screen merges them on top of the built-ins.
export async function GET() {
  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ ok: true, tracks: [] });
  }

  const db = await getMongoDb();
  const tracks = await db
    .collection("music-tracks")
    .find({}, { projection: { _id: 0, createdAt: 0 } })
    .toArray();

  return NextResponse.json({ ok: true, tracks });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON payload"
      },
      { status: 400 }
    );
  }

  const parsed = musicTrackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid music track payload"
      },
      { status: 400 }
    );
  }

  const track = {
    ...parsed.data,
    source: "custom" as const,
    createdAt: new Date()
  };

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({
      ok: true,
      stored: false,
      track
    });
  }

  const db = await getMongoDb();
  const result = await db.collection("music-tracks").insertOne(track);

  return NextResponse.json({
    ok: true,
    stored: true,
    id: result.insertedId.toString()
  });
}
