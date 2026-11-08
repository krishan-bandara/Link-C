import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_DURATION_S, videoLimitProblem } from '../src/lib/upload-process';
import { MAX_IMAGE_SIDE_PX } from '../src/lib/image-preview';

const videoStream = (w: number, h: number, duration?: string) => ({
  streams: [{ codec_type: 'video', width: w, height: h, duration }],
});

describe('videoLimitProblem', () => {
  it('accepts a normal video (resolution and duration within caps)', () => {
    expect(videoLimitProblem(videoStream(1920, 1080, '120'))).toBeNull();
  });

  it('rejects a video above the resolution cap on either side', () => {
    expect(videoLimitProblem(videoStream(MAX_IMAGE_SIDE_PX + 1, 100, '10'))).toMatch(/too large/);
    expect(videoLimitProblem(videoStream(100, MAX_IMAGE_SIDE_PX + 1, '10'))).toMatch(/too long|too large/);
    expect(videoLimitProblem(videoStream(MAX_IMAGE_SIDE_PX, MAX_IMAGE_SIDE_PX, '10'))).toBeNull();
  });

  it('rejects a video above the duration cap, using format.duration when the stream has none', () => {
    expect(videoLimitProblem({ streams: [{ codec_type: 'video', width: 640, height: 480 }], format: { duration: String(MAX_VIDEO_DURATION_S + 1) } })).toMatch(
      /too long/,
    );
    expect(videoLimitProblem(videoStream(640, 480, String(MAX_VIDEO_DURATION_S)))).toBeNull();
    expect(videoLimitProblem(videoStream(640, 480, String(MAX_VIDEO_DURATION_S + 1)))).toMatch(/too long/);
  });

  it('is permissive only when there is no video stream at all (a different check rejects that case)', () => {
    expect(videoLimitProblem({ streams: [] })).toBeNull();
    expect(videoLimitProblem(null)).toBeNull();
  });

  it('fails closed when a video stream exists but its size or length cannot be read (crafted/malformed metadata)', () => {
    expect(videoLimitProblem({ streams: [{ codec_type: 'video' }] })).toMatch(/could not be read/);
    expect(videoLimitProblem(videoStream(0, 480, '10'))).toMatch(/could not be read/);
    expect(videoLimitProblem(videoStream(640, 0, '10'))).toMatch(/could not be read/);
    expect(videoLimitProblem(videoStream(640, 480, 'not-a-number'))).toMatch(/could not be read/);
    expect(videoLimitProblem({ streams: [{ codec_type: 'video', width: 640, height: 480 }] })).toMatch(/could not be read/);
  });
});
