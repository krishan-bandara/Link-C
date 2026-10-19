import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addPackSticker, readBodyCapped } from '@/lib/assets';
import { audit, handle, requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024;

const query = z.object({
  packId: z.string().uuid(),
  emoji: z.string().trim().max(16).optional(),
});

/**
 * Owner only. Body is ONE raw image (jpeg/png/webp/gif, up to 4 MB). The client uploads files one by one.
 * addPackSticker verifies the real image type from the bytes.
 */
export const POST = handle(async (req: Request) => {
  const { user } = await requireOwner();
  const url = new URL(req.url);
  const q = query.parse({
    packId: url.searchParams.get('packId'),
    emoji: url.searchParams.get('emoji') || undefined,
  });
  const image = await readBodyCapped(req, MAX_BYTES);
  const id = await addPackSticker(q.packId, user.id, image, q.emoji || undefined);
  await audit(user.id, 'sticker_added', id);
  return NextResponse.json({ id });
});
