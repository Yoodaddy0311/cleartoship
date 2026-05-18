/**
 * English (en-US) UI strings — flat key→string map.
 * Mirror of `./ko` — keep keys in lockstep; `ko.ts` is the source of truth
 * for the key set (see `Messages` type below).
 */
import type { Ko } from './ko';

/**
 * Messages shape is derived from `ko` so the TypeScript compiler refuses
 * to merge an `en` map that drops or invents keys.
 */
export type Messages = { [K in keyof Ko]: string };

export const en: Messages = {
  // App
  'app.title': 'ClearToShip — Vibe Coding Launch Audit',
  'app.description':
    'Enter your GitHub repo and deploy URL — we audit launch readiness across 10 categories and produce an evidence-based report and improvement PRD.',
  'app.brand': 'ClearToShip',
  'app.tagline': 'Is your vibe-coded app ready to ship?',

  // Navigation
  'nav.home': 'Home',
  'nav.audits': 'My Audits',
  'nav.docs': 'Docs',
  'nav.start': 'Start Audit',

  // Home / Audit Start
  'home.hero.eyebrow': 'AI Product Auditor',
  'home.hero.title': 'Find out if your code is ready to ship in 5 seconds',
  'home.hero.subtitle':
    'Drop in your GitHub repo and deploy URL — we audit across 10 categories and deliver an evidence-backed report and improvement PRD.',
  'home.form.repoUrl.label': 'GitHub Repository URL',
  'home.form.repoUrl.placeholder': 'https://github.com/user/repo',
  'home.form.repoUrl.hint': 'Public repositories only',
  'home.form.deployUrl.label': 'Deploy URL (optional)',
  'home.form.deployUrl.placeholder': 'https://my-app.vercel.app',
  'home.form.deployUrl.hint': 'If provided, we analyze the live UI too',
  'home.form.prd.label': 'PRD Document (optional)',
  'home.form.prd.hint': 'Upload a PRD file or paste it directly',
  'home.form.prd.mode.text': 'Paste text',
  'home.form.prd.mode.file': 'Upload file',
  'home.form.prd.placeholder':
    'Describe the features you intended to build. We compare requirements against the actual implementation.',
  'home.form.prd.file.hint': '.md or .txt file (up to 50,000 characters)',
  'home.form.prd.file.tooLarge': 'PRD file exceeds the 50,000 character limit.',
  'home.form.prd.file.readError': 'Could not read the file. Please choose another one.',
  'home.form.prd.file.selected': 'Selected file',
  // W2-A: PrdInput component (textarea + file upload + counter). Distinct
  // from the legacy `home.form.prd.*` keys (kept for other call sites).
  'audit.prd.label': 'Product Requirements (optional)',
  'audit.prd.placeholder': 'Paste your PRD or upload .md/.txt',
  'audit.prd.fileButton': 'Load from file',
  'audit.prd.tooLarge': 'PRD must be 50KB or less',
  'home.form.profile.label': 'Audit profile (optional)',
  'home.form.profile.hint': 'Pick a domain to bias scoring toward its priority categories',
  'home.form.profile.option.none': 'Default (no weight bias)',
  'home.form.profile.option.landing': 'Landing page (UX, frontend, launch readiness)',
  'home.form.profile.option.saas': 'SaaS / API (backend, security, data model)',
  'home.form.profile.option.ecommerce': 'E-commerce (security, checkout, UX flows)',
  'home.form.profile.option.vibeCoded':
    'Vibe-coded (prompt consistency, implementation alignment)',
  'home.form.submit': 'Start Audit',
  'home.form.submitting': 'Requesting audit...',
  'home.form.auth.initializing': 'Preparing authentication...',
  'home.form.auth.error': 'Anonymous sign-in failed. Please refresh the page.',
  'home.form.error.repoUrl': 'Enter a valid GitHub URL',
  'home.form.error.deployUrl': 'Enter a valid URL',
  'home.form.error.generic': 'Audit request failed. Please try again in a moment.',
  'home.preview.title': "Here's what you'll receive",
  'home.preview.card1.title': 'Scores across 10 categories',
  'home.preview.card1.desc':
    'From product intent to security — every category is scored 0 to 100 for launch readiness.',
  'home.preview.card2.title': 'Evidence-backed findings',
  'home.preview.card2.desc':
    'Every issue ships with a file:line or selector citation. Decisions are grounded in facts, not opinions.',
  'home.preview.card3.title': 'Ready-to-use improvement PRD',
  'home.preview.card3.desc':
    'Download a single Markdown file and paste it straight into Claude Code or Cursor.',

  // Marketing
  'mk.hero.eyebrow': 'AI Product Auditor for Vibe Coders',
  'mk.hero.title.pre': 'Know if it ships',
  'mk.hero.title.accent': 'in 5 seconds',
  'mk.hero.title.post': '— no guessing.',
  'mk.hero.subtitle':
    'Provide your GitHub repo and deploy URL — we audit across 10 categories and generate an evidence-based report.',
  'mk.hero.cta.primary': 'Start a free audit',
  'mk.hero.cta.secondary': 'View a sample report',
  'mk.trust.title': 'The launch audit that vibe coders trust',
  'mk.features.title': 'One click. A clear ship/no-ship answer.',
  'mk.features.subtitle': 'Backed by evidence, not opinion.',
  'mk.features.f1.title': 'Scores across 10 categories',
  'mk.features.f1.desc': 'From product intent to security — launch readiness scored 0 to 100.',
  'mk.features.f2.title': 'Evidence-backed findings',
  'mk.features.f2.desc': 'Every issue automatically attaches a file:line or selector citation.',
  'mk.features.f3.title': 'Improvement PRD, ready to paste',
  'mk.features.f3.desc': 'Single Markdown file you can drop straight into Claude Code or Cursor.',
  'mk.how.title': 'A launch audit in three steps',
  'mk.how.s1.title': 'Connect repo',
  'mk.how.s1.desc': 'Enter your GitHub repository and deploy URL.',
  'mk.how.s2.title': 'Run audit',
  'mk.how.s2.desc': 'The audit runs automatically across 10 categories.',
  'mk.how.s3.title': 'Ship with evidence',
  'mk.how.s3.desc': 'Take the evidence-backed report and improvement PRD and apply them right away.',
  'mk.cta.title': 'Check whether you can ship today',
  'mk.cta.subtitle': 'No credit card. One minute is enough.',
  'mk.cta.button': 'Get started',

  // Audit Progress
  'progress.title': 'Audit in progress',
  'progress.subtitle': "We're analyzing your code and UI. Hang tight.",
  'progress.eta.suffix': 'remaining',
  'progress.cancel': 'Cancel',
  'progress.error.title': 'Something went wrong during the audit',
  'progress.error.retry': 'Retry',

  // Dashboard
  'dashboard.title': 'Audit Dashboard',
  'dashboard.score.label': 'Launch readiness',
  'dashboard.severity.title': 'Priority issues',
  'dashboard.severity.p0': 'Blocks launch',
  'dashboard.severity.p1': 'Critical improvement',
  'dashboard.severity.p2': 'Quality improvement',
  'dashboard.severity.p3': 'Long-term improvement',
  'dashboard.categories.title': 'Scores by area',
  'dashboard.categories.viewAll': 'See all',
  'dashboard.top5.title': 'Top 5 items to tackle first',
  'dashboard.summary.title': 'One-line summary',
  'dashboard.tab.dashboard': 'Dashboard',
  'dashboard.tab.categories': 'Categories',
  'dashboard.tab.featureGraph': 'Feature graph',
  'dashboard.tab.findings': 'Findings',
  'dashboard.tab.report': 'Audit report',
  'dashboard.tab.improvementPrd': 'Improvement PRD',

  // Categories page (Layer 2 of 3-layer progressive disclosure)
  'categories.title': 'Categories',
  'categories.subtitle': 'Expand a category to see its priority issues.',
  'categories.loading': 'Loading category results.',
  'categories.breadcrumb.aria': 'Breadcrumb',
  'categories.count.prefix': 'Found ',
  'categories.count.suffix': ' issues',
  'categories.na.aria': 'score unavailable',
  'categories.empty.row': 'No issues found.',
  'categories.empty.panel': 'No issues were found in this category.',
  'categories.viewAll.prefix': 'See all (',
  'categories.viewAll.suffix': ')',

  // Launch status
  'launch.ready': 'Ready to ship',
  'launch.readyWithImprovements': 'Ready to ship with recommended fixes',
  'launch.needsWork': 'Needs work before launch',
  'launch.stop': 'Hold the launch',

  // Wave 1 W1.4 — Founder Confidence Score (FCS)
  'fcs.label.score': 'Founder Confidence Score',
  'fcs.label.uncertainty': 'Uncertainty ±{value}',
  'fcs.label.topConcerns': 'Top Concerns',
  'fcs.label.rationale': 'Rationale',
  'fcs.label.status': 'Launch Status',
  'fcs.label.indeterminateNote': 'Coverage too thin to confirm — showing confidence band only.',
  'fcs.aria.gauge': 'Founder confidence score {score} out of 100, range {lower} to {upper}',
  'fcs.aria.uncertaintyBar': 'Score confidence band from {lower} to {upper}',
  'fcs.empty.concerns': 'No major concerns identified.',
  'fcs.status.READY': 'Ready',
  'fcs.status.CONDITIONAL': 'Ready with caveats',
  'fcs.status.NEEDS_WORK': 'Needs work',
  'fcs.status.AT_RISK': 'At risk',
  'fcs.status.NOT_READY': 'Not ready',
  'fcs.status.INDETERMINATE': 'Indeterminate',
  'fcs.status.BLOCKED': 'Audit blocked',

  // Findings
  'findings.title': 'Findings',
  'findings.filter.severity': 'Severity',
  'findings.filter.category': 'Category',
  'findings.filter.confidence': 'Confidence',
  'findings.filter.confidence.high': 'High',
  'findings.filter.confidence.medium': 'Medium',
  'findings.filter.confidence.low': 'Low',
  'findings.filter.falsePositive': 'False positive',
  'findings.filter.falsePositive.all': 'All',
  'findings.filter.falsePositive.show': 'FP only',
  'findings.filter.falsePositive.hide': 'Hide FP',
  'findings.filter.all': 'All',
  'findings.filter.reset': 'Reset filters',
  'findings.sort.ariaAsc': 'Sorted ascending',
  'findings.sort.ariaDesc': 'Sorted descending',
  'findings.sort.ariaNone': 'Not sorted',
  'findings.empty.title': 'No issues found',
  'findings.empty.desc': 'Nicely done — explore the additional recommended checklist.',
  'findings.column.title': 'Title',
  'findings.column.category': 'Category',
  'findings.column.severity': 'Severity',
  'findings.column.confidence': 'Confidence',
  'findings.column.actionHint': 'Next action',
  'findings.actionHint.title': 'Next action',
  'findings.actionHint.etaPrefix': 'ETA',
  'findings.actionHint.empty': 'Action guide pending',
  'findings.actionHint.eta.5': '5 min',
  'findings.actionHint.eta.30': '30 min',
  'findings.actionHint.eta.60': '1 hr',
  'findings.actionHint.eta.240': 'Half-day+',
  'findings.actionHint.referenceLabel': 'Reference',
  'findings.actionHint.referenceAria': 'Open reference material in a new tab',
  'findings.detail.nonDeveloper': 'Plain-language explanation',
  'findings.detail.technical': 'Technical rationale',
  'findings.detail.impact': 'Impact',
  'findings.detail.recommendation': 'Recommendation',
  'findings.detail.acceptance': 'Acceptance criteria',
  'findings.detail.evidences': 'Evidence',
  'findings.detail.includeInPrd': 'Include in improvement PRD',
  'findings.detail.evidences.truncated':
    'Some evidence is omitted (server limit reached)',
  'findings.detail.falsePositive.toggle': 'Mark as false positive',
  'findings.detail.falsePositive.marked': 'Marked as false positive',
  'findings.detail.falsePositive.unmarked': 'Mark as false positive',
  'findings.detail.falsePositive.error':
    'Failed to save. Please try again in a moment.',

  // Feature Graph
  'graph.title': 'Feature Graph',
  'graph.filter.all': 'All',
  'graph.filter.byStatus': 'Filter by status',
  'graph.legend.title': 'Legend',
  'graph.empty': 'No feature nodes have been analyzed yet.',
  'graph.node.summary': 'Summary',
  'graph.node.evidence': 'Related files',
  'graph.node.improvement': 'Recommendation',

  // Status labels (9 statuses)
  'status.complete': 'Complete',
  'status.partial': 'Partial',
  'status.ui_only': 'UI only',
  'status.logic_only': 'Logic only',
  'status.missing_connection': 'Missing connection',
  'status.missing': 'Not implemented',
  'status.risky': 'Risky implementation',
  'status.recommended': 'Recommended',
  'status.unknown': 'Needs review',

  // Categories (11) — UPPER_SNAKE matches shared-types AuditCategory enum.
  'category.PRODUCT_INTENT': 'Product intent',
  'category.REQUIREMENT_COVERAGE': 'Requirement coverage',
  'category.FEATURE_GRAPH': 'Feature graph',
  'category.FUNCTIONAL_FLOW': 'Functional flow',
  'category.UX_UI': 'UX/UI',
  'category.FRONTEND_CODE': 'Frontend code',
  'category.BACKEND_API': 'Backend / API',
  'category.DATA_MODEL': 'Data model',
  'category.SECURITY_PRIVACY': 'Security & privacy',
  'category.LAUNCH_READINESS': 'Launch readiness',
  'category.BUSINESS_READINESS': 'Business readiness',

  // Report
  'report.title': 'Audit Report',
  'report.download': 'Download Markdown',
  'report.print': 'Print',

  // Improvement PRD
  'prd.title': 'Improvement PRD',
  'prd.copyPrompt': 'Copy as vibe-coding prompt',
  'prd.copied': 'Copied',
  'prd.download': 'Download Markdown',

  // Common
  'common.loading': 'Loading...',
  'common.error': 'Something went wrong',
  'common.retry': 'Retry',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.search': 'Search',
  'common.notFound.title': 'Page not found',
  'common.notFound.desc': 'Please double-check the URL.',
  'common.notFound.cta': 'Back to home',
  'common.skipToMain': 'Skip to main content',
  'common.required': 'Required',
  'common.optional': 'Optional',

  // Samples gallery — T2.9 #121
  'samples.title': 'Sample Repo Gallery',
  'samples.subtitle':
    'Try the audit on real open-source repos. See what the output looks like in under a minute.',
  'samples.tag.benchmark': 'Strong benchmark',
  'samples.tag.typicalIssues': 'Typical issues',
  'samples.tag.minimal': 'Minimal repo',
  'samples.expected.label': 'Expected result',
  'samples.cta': 'Audit this repo',
  'samples.card.thumbnailAlt': '{name} repository preview',

  // Footer
  'footer.copyright': '© 2026 ClearToShip. All rights reserved.',
  'footer.note': 'Evidence-based launch audit platform',

  // Errors — audit failures
  'errors.audit.invalidUrl': 'The repository URL format is invalid',
  'errors.audit.notFound': 'The requested audit could not be found',
  'errors.audit.timedOut': 'The audit did not complete within the time limit (5 minutes)',
  'errors.audit.cloneFailed': 'Repository clone failed. Make sure the repo is public',
  'errors.audit.deployUrlUnreachable': 'The deploy URL is unreachable',
  'errors.audit.toolUnavailable': 'Tools {toolNames} are not installed — partial results only',
  'errors.audit.toolUnavailable.summary': '{count} checks were skipped on this run',
  'errors.audit.toolUnavailable.disclaimer':
    'This is an analysis environment issue and does not significantly affect result confidence',
  'errors.audit.toolUnavailable.deployUrlHint':
    'Add a deploy URL and we will also measure your site performance and accessibility',
  // T2.12 #112: N/A category labels (BLOCKED vs FAILED distinction)
  'errors.audit.toolUnavailable.categoryHeading': 'Categories shown as N/A',
  'errors.audit.toolUnavailable.whyNa': 'Why is this N/A?',
  'errors.audit.toolUnavailable.naReason.skipped': 'not executed',
  'errors.audit.toolUnavailable.naReason.blocked': 'aborted by guardrail',
  'errors.audit.toolUnavailable.naReason.failed': 'tool error',
  'errors.audit.toolUnavailable.blockedNote':
    'The audit was aborted by a guardrail, so several categories were not measured. Reason: {abortReason}',
  'errors.audit.category.SECURITY_PRIVACY': 'Security check',
  'errors.audit.category.FRONTEND_CODE': 'Code quality check',
  'errors.audit.category.LAUNCH_READINESS': 'Performance check',
  'errors.audit.category.UX_UI': 'Accessibility check',

  // Empty / pending guidance for resource panels
  'audit.empty.unsupportedFramework':
    'Automatic analysis is currently optimized for frameworks such as Next.js / Vite. Detected framework: {framework}. Partial results are available.',
  'audit.empty.noDeployUrl':
    'No deploy URL provided, so performance/accessibility measurement was skipped. Code checks completed normally.',
  'audit.empty.pipelineNotReached':
    'This step has not been reached yet. Results will appear automatically as the analysis progresses.',
  'audit.empty.nextActions': 'What you can do next',

  // Errors — general
  'errors.general.networkError': 'A network error occurred. Please try again in a moment',
  'errors.general.unexpected': 'An unexpected error occurred',

  // W2.C10.1: RunMetadataStrip
  'audit.run.id.copy.aria': 'Copy run ID',
  'audit.run.id.copied': 'Copied',
};

export type En = typeof en;
