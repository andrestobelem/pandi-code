/**
 * Scout -> dynamic fan-out -> pipeline with per-item adaptive depth.
 *
 * The work-list is DISCOVERED by scouting (not assumed), then each file
 * flows through a pipeline: a cheap structured classification, and a deep review
 * ONLY for the items that turn out high-signal. Low-risk items short-circuit.
 * That per-item branching (spend more only where it pays) is dynamism.
 *
 * Uses: a discovery agent (scout), pipeline(items, ...stages) with stage
 * (value, originalItem, index), agent({ schema }) for a typed verdict.
 */

export const meta = {
  name: 'scout-fanout',
  description: 'Scout then dynamic fan-out via pipeline: cheap risk-classify every file, deep-review only high/medium (also classify-and-act and large-migration)',
  phases: [
    { title: 'Scout' },
    { title: 'Classify' },
    { title: 'Deep Review' },
    { title: 'Synthesis' },
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

// agent() schemas are backed by a tool input_schema, whose top-level type MUST be 'object'.
// Wrap the path list in an object rather than using a bare top-level array schema.
const FILE_LIST = {
  type: 'object',
  additionalProperties: false,
  required: ['files'],
  properties: { files: { type: 'array', items: { type: 'string' } } },
};

const PATTERNS = {
  code: "\\.(ts|tsx|js|jsx|py|go|rs)$",
  docs: "\\.(md|mdx|txt|rst|adoc)$",
  web: "\\.(html|css|scss|vue|svelte)$",
  config: "\\.(json|ya?ml|toml|ini)$",
};
const pattern = PATTERNS[input?.pattern] ?? (typeof input?.pattern === 'string' && input.pattern.trim() ? input.pattern.trim() : PATTERNS.code);

// Review lens: WHAT to look for. Preset key OR free-form string; default "code".
const LENSES = {
  code: 'likely bugs, race conditions, security issues, data-loss risks, and edge-case failures',
  security: 'security vulnerabilities: injection, broken authz/authn, secrets exposure, unsafe deserialization, SSRF, path traversal',
  prose: 'unclear or incorrect wording, factual errors, inconsistencies, broken links/references, and structural problems',
};
const lens = LENSES[input?.lens] ?? (typeof input?.lens === 'string' && input.lens.trim() ? input.lens.trim() : LENSES.code);
const maxFiles = Math.max(1, Math.min(200, Number.isFinite(+input?.maxFiles) ? Math.floor(+input.maxFiles) : 40));

// 1) SCOUT — discover the real work-list and its size before committing.
// Filter inside the agent prompt (never via shell interpolation) so input.pattern cannot inject.
let files;
if (Array.isArray(input?.files) && input.files.length) {
  if (input.files.length > maxFiles) {
    log('received ' + input.files.length + ' files, capping to ' + maxFiles + ' (dropped ' + (input.files.length - maxFiles) + ')');
  }
  files = input.files.slice(0, maxFiles);
} else {
  const scouted = await agent(
    'Run: git ls-files. Keep only paths matching the regex ' + pattern + '. Return up to ' + maxFiles + ' of them as JSON: { "files": ["path", ...] }.',
    node('scout', { model: 'haiku', effort: 'low', schema: FILE_LIST, phase: 'Scout' }),
  );
  const scoutedFiles = scouted?.files ?? [];
  if (scoutedFiles.length > maxFiles) {
    log('scout returned ' + scoutedFiles.length + ' files, capping to ' + maxFiles + ' (dropped ' + (scoutedFiles.length - maxFiles) + ')');
  }
  files = scoutedFiles.slice(0, maxFiles);
}
log('scouted ' + files.length + ' files ' + JSON.stringify({ pattern }));
if (files.length === 0) return 'No files matched; nothing to review.';

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['risk', 'why'],
  properties: {
    risk: { type: 'string', enum: ['high', 'medium', 'low'], description: 'one of: high | medium | low' },
    why: { type: 'string', description: 'one short sentence' },
  },
};

// 2) PIPELINE: classify every file (cheap), deep-review only high/medium (adaptive depth).
const reviewed = await pipeline(
  files,
  (file, _orig, i) =>
    agent(`Classify how likely ${file} is to contain ${lens}. Be quick; do not deep-dive.`, node('classify', {
      model: 'haiku',
      effort: 'low',
      label: `classify-${i}`,
      schema: VERDICT,
      phase: 'Classify',
    })).then((verdict) => verdict == null ? null : ({ file, verdict })),
  (c, _orig, i) => {
    const risk = c.verdict?.risk;
    if (risk !== 'high' && risk !== 'medium') return { ...c, deep: { skipped: true } }; // short-circuit low risk
    return agent(
      `Deep review ${c.file} for the risk you flagged ("${c.verdict?.why}"). Cite file:line for each finding; say NO_FINDINGS if none.`,
      node('deep', { model: 'sonnet', effort: 'medium', label: `deep-${i}`, phase: 'Deep Review' }),
    ).then((output) => output == null ? { ...c, deep: { failed: true } } : ({ ...c, deep: output }));
  },
);

const settled = reviewed.filter(Boolean);
const failedCount = reviewed.length - settled.length;
const skippedCount = settled.filter((c) => c.deep && c.deep.skipped === true).length;
const failedDeep = settled.filter((c) => c.deep && c.deep.failed === true).length;
const findings = settled.filter((c) => typeof c.deep === 'string' && !/NO_FINDINGS/.test(c.deep));
log('deep-reviewed ' + findings.length + '/' + files.length + ' (rest were low-risk or clean)');

const coverage = `Coverage: ${files.length} files total, ${findings.length} deep-reviewed with findings, ${skippedCount} low-risk/clean skipped, ${failedCount + failedDeep} failed branch(es).`;
const synthesis = await agent(
  `Synthesize prioritized findings from these deep reviews. Deduplicate and drop unsupported claims.\n\n${coverage}\nExplicitly note partial coverage: do not treat skipped/failed files as clean.\n\n${compact(findings, 60000)}\n\nNow produce the prioritized findings, most severe first, drop unsupported claims, and mention any coverage gaps (skipped or failed branches).`,
  node('synthesis', { model: 'opus', effort: 'high', phase: 'Synthesis' }),
);
return synthesis;
