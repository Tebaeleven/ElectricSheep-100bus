import { NextResponse } from "next/server";
import { latestDownloads, parsePlatform, zipUrl } from "@/lib/download";

export const revalidate = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform: raw } = await params;
  const platform = parsePlatform(raw);
  if (!platform) {
    return NextResponse.redirect(new URL("/download", req.url), 302);
  }
  const latest = await latestDownloads();
  return NextResponse.redirect(zipUrl(latest, platform), 302);
}
