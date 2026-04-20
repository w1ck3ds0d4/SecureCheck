// Ask Claude to review the PR diff for security issues with real exploit paths.
// Emits a JSON array on stdout: [{severity,file,line,title,why}, ...]. Empty array = all clear.

import { execSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';
const MAX_DIFF_CHARS = 40_000;
const MAX_TOKENS = 2048;

const { ANTHROPIC_API_KEY, BASE_REF } = process.env;

if (!ANTHROPIC_API_KEY) {
  console.log('[]');
  process.exit(0);
}

let diff = '';
try {
  execSync(`git fetch --no-tags --depth=1 origin ${BASE_REF}`, { stdio: 'ignore' });
  diff = execSync(`git diff origin/${BASE_REF}...HEAD`, { encoding: 'utf8' });
} catch (err) {
  console.error(`Failed to compute diff: ${err.message}`);
  console.log('[]');
  process.exit(0);
}

if (!diff.trim()) {
  console.log('[]');
  process.exit(0);
}

const truncated = diff.length > MAX_DIFF_CHARS
  ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n[diff truncated for review]'
  : diff;

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const systemPrompt = `You review code diffs for security issues in a single pass.

Focus ONLY on issues that are:
- Introduced or worsened by this diff (not pre-existing unchanged code)
- Actually exploitable or materially weaken a security boundary

Skip: style, naming, performance, theoretical concerns, missing tests, generic hardening suggestions, anything that is not a clear security risk.

Output STRICTLY a JSON array. Each element: {"severity":"critical"|"high"|"medium"|"low","file":"path","line":integer-or-null,"title":"short title","why":"one sentence explaining the exploit path"}. If there is nothing worth flagging, output [].

Do NOT wrap the JSON in prose, markdown, or code fences. Output only the array.`;

const userPrompt = `Review the following unified diff and output your findings as JSON:\n\n${truncated}`;

let text = '';
try {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  text = msg.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
} catch (err) {
  console.error(`Claude API call failed: ${err.message}`);
  console.log('[]');
  process.exit(0);
}

const match = text.match(/\[[\s\S]*\]/);
if (!match) {
  console.log('[]');
  process.exit(0);
}

try {
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) {
    console.log('[]');
    process.exit(0);
  }
  console.log(JSON.stringify(parsed));
} catch {
  console.log('[]');
}
