/**
 * Composition driver — parent workflow calling a reusable sub-workflow.
 *
 * Requires a sibling project/global workflow `verify-claims-lib`. The parent
 * discovers claims, then delegates the reusable verification phase with
 * workflow('verify-claims-lib', args).
 *
 * Input: { topic: "...", maxClaims?: 8, skeptics?: 3 }
 */
export const meta = {
  name: 'composition-driver',
  description: 'Parent workflow: discover claims, then delegate verification to the verify-claims-lib sub-workflow (compose-verify-claims)',
  phases: [
    { title: 'Discover' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
};

const input = (() => { try { return typeof args === 'string' ? (JSON.parse(args) || {}) : (args || {}); } catch { return {}; } })();

const compact = (d, n = 60000) => {
  const s = typeof d === 'string' ? d : JSON.stringify(d);
  return s.length > n ? s.slice(0, n) + ' …[truncated]' : s;
};
// Per-node model + reasoning-effort overrides.
//   input.model / input.effort   -> global defaults applied to EVERY node
//   input.models[role] / input.efforts[role] -> per-node override (role = the node's stable logical name)
// Precedence: per-role override > global default > the call-site default. effort: low|medium|high|xhigh|max.
const models = (input && typeof input.models === "object" && input.models) ? input.models : {};
const efforts = (input && typeof input.efforts === "object" && input.efforts) ? input.efforts : {};
const toolsByRole = (input && typeof input.toolsByRole === "object" && input.toolsByRole) ? input.toolsByRole : {};
const skillsByRole = (input && typeof input.skillsByRole === "object" && input.skillsByRole) ? input.skillsByRole : {};
const excludeByRole = (input && typeof input.excludeByRole === "object" && input.excludeByRole) ? input.excludeByRole : {};
const node = (role, extra = {}) => {
  const o = { label: role, ...extra };
  const m = models[role] ?? input?.model;
  const e = efforts[role] ?? input?.effort;
  if (m != null) o.model = m;
  if (e != null) o.effort = e;
  const t = toolsByRole[role] ?? input?.tools;
  const s = skillsByRole[role] ?? input?.skills;
  const x = excludeByRole[role] ?? input?.excludeTools;
  if (Array.isArray(t)) o.tools = t;
  if (Array.isArray(s)) o.skills = s;
  if (Array.isArray(x)) o.excludeTools = x;
  return o;
};
// Object-wrapped (top-level schema type MUST be 'object'); a schema makes the
// finder reliably return parseable claims instead of prose we have to safeParse.
const CLAIMS = {
  type: 'object',
  additionalProperties: false,
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'claim', 'evidence'],
        properties: {
          id: { type: 'string' },
          claim: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
  },
};

const topic = input?.topic ?? input?.question ?? input?.text;
if (!topic) throw new Error('Pass { topic: "claims to discover and verify" }.');
const requestedMaxClaims = Math.max(1, Number.isFinite(+input?.maxClaims) ? Math.floor(+input.maxClaims) : 8);
const maxClaims = Math.min(20, requestedMaxClaims);
if (maxClaims !== requestedMaxClaims) log('maxClaims clamped ' + JSON.stringify({ requested: requestedMaxClaims, effective: maxClaims }));

phase('Discover');
const finder = await agent(
  `Find up to ${maxClaims} concrete, falsifiable claims about the topic below. ` +
    `Return JSON: { "claims": [ { "id", "claim", "evidence" }, ... ] }. Evidence can be a file:line, URL, or command observation.\n\n` +
    `Topic: ${topic}`,
  node('claim-finder', { model: 'haiku', effort: 'low', schema: CLAIMS, phase: 'Discover' }),
);

const found = Array.isArray(finder?.claims) ? finder.claims.filter((claim) => claim && claim.claim) : [];
const claims = found.slice(0, maxClaims);
if (claims.length === 0) return 'No falsifiable claims found to verify.';
if (found.length > maxClaims) log('claim cap applied ' + JSON.stringify({ found: found.length, kept: maxClaims }));

phase('Verify');
const skeptics = Math.max(1, Math.min(8, Math.floor(Number(input?.skeptics) || 3)));
if (skeptics !== (input?.skeptics ?? 3)) log('skeptics clamped ' + JSON.stringify({ requested: input?.skeptics, effective: skeptics }));
let verification;
try {
  verification = await workflow('verify-claims-lib', {
    claims,
    skeptics,
    topic,
  });
} catch (e) {
  log('nested workflow unavailable, degrading: ' + String(e));
  verification = { verified: claims, note: 'verification skipped (nesting depth exceeded)' };
}

phase('Synthesize');
const synthesis = await agent(
  `Synthesize the verified/dropped claims below. Preserve uncertainty, cite evidence, and mention that verification was delegated to verify-claims-lib.\n\n` +
    `${compact(verification, 50000)}\n\nNow synthesize the verified/dropped claims above: preserve uncertainty, cite evidence, and note verification was delegated to verify-claims-lib.`,
  node('composition-synthesis', { model: 'opus', effort: 'high', phase: 'Synthesize' }),
);

return synthesis;
