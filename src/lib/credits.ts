export type Credit = { name: string; by: string; license: string; url: string; note?: string };

/** Third-party work we ship or build on. Full licence texts: THIRD-PARTY-NOTICES.md */
export const CREDITS: Credit[] = [
  {
    name: 'Fluent Emoji',
    by: 'Microsoft',
    license: 'MIT',
    url: 'https://github.com/microsoft/fluentui-emoji',
    note: 'Colourful 3D emoji used as the official sticker packs',
  },
  { name: 'emoji-mart', by: 'Missive', license: 'MIT', url: 'https://github.com/missive/emoji-mart', note: 'Emoji picker' },
  { name: 'lucide-react', by: 'Lucide Contributors', license: 'ISC', url: 'https://github.com/lucide-icons/lucide', note: 'Icons' },
  { name: 'Next.js', by: 'Vercel', license: 'MIT', url: 'https://github.com/vercel/next.js' },
  { name: 'React', by: 'Meta Platforms', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'Supabase', by: 'Supabase', license: 'Apache-2.0', url: 'https://github.com/supabase/supabase-js' },
  { name: 'sharp', by: 'Lovell Fuller and contributors', license: 'Apache-2.0', url: 'https://github.com/lovell/sharp', note: 'Image processing' },
  { name: 'zxcvbn-ts', by: 'zxcvbn-ts contributors', license: 'MIT', url: 'https://github.com/zxcvbn-ts/zxcvbn', note: 'Password strength estimation' },
  { name: 'LiveKit client', by: 'LiveKit', license: 'Apache-2.0', url: 'https://github.com/livekit/client-sdk-js', note: 'Voice and video calls' },
];
