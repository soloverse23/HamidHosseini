import type { APIContext } from 'astro';

// Everything public is welcome, including AI crawlers: the point of the site is
// to be found, cited and quoted. Only the search UI and the redirect stub are hidden.
const AI_AGENTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'Bingbot',
  'CCBot', 'Bytespider', 'cohere-ai', 'Meta-ExternalAgent', 'DuckAssistBot', 'MistralAI-User', 'YouBot',
];

export function GET({ site }: APIContext) {
  const origin = site!.origin;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /*/search/',
    '',
    ...AI_AGENTS.flatMap((a) => [`User-agent: ${a}`, 'Allow: /', 'Disallow: /*/search/', '']),
    `Sitemap: ${origin}/sitemap-index.xml`,
    `# LLM-friendly summary: ${origin}/llms.txt`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
