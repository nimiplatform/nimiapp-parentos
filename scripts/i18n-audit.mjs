#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG_PATH = join(ROOT, 'scripts', 'i18n.config.json');

const VISIBLE_STRING_PROP_NAMES = [
  'aria-label',
  'aria-description',
  'alt',
  'backLabel',
  'buttonLabel',
  'cancelLabel',
  'caption',
  'description',
  'desc',
  'emptyDescription',
  'emptyText',
  'emptyTitle',
  'header',
  'hint',
  'label',
  'link',
  'placeholder',
  'sub',
  'submitLabel',
  'subtitle',
  'title',
];

function toPosixPath(pathLike) {
  return pathLike.replaceAll('\\', '/');
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config: ${toPosixPath(relative(ROOT, CONFIG_PATH))}`);
  }

  const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const audit = parsed?.audit ?? {};
  return {
    scopeDirs: Array.isArray(audit.scopeDirs) ? audit.scopeDirs : [],
    extensions: Array.isArray(audit.extensions) ? audit.extensions : ['.ts', '.tsx'],
    excludePathPatterns: Array.isArray(audit.excludePathPatterns) ? audit.excludePathPatterns : [],
    allowTextPatterns: Array.isArray(audit.allowTextPatterns) ? audit.allowTextPatterns : [],
    maxReportedViolations:
      Number.isInteger(audit.maxReportedViolations) && audit.maxReportedViolations > 0
        ? audit.maxReportedViolations
        : 160,
  };
}

function shouldExcludeFile(input, excludePatterns) {
  const normalized = toPosixPath(input);
  return excludePatterns.some((pattern) => normalized.includes(String(pattern)));
}

function collectFiles(input) {
  const files = [];
  const stack = [input];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !existsSync(current)) {
      continue;
    }
    const stats = statSync(current);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        stack.push(join(current, entry.name));
      }
      continue;
    }
    files.push(current);
  }
  return files;
}

function escapedPropAlternation() {
  return VISIBLE_STRING_PROP_NAMES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

const visibleProps = escapedPropAlternation();
const visiblePropSet = new Set(VISIBLE_STRING_PROP_NAMES);
const USER_FEEDBACK_SETTER_PATTERN =
  /^set(?:[A-Z][A-Za-z0-9]*)?(?:Error|ErrorMsg|ErrorMessage|Message|StatusMessage|CommitError|RuntimeError)$/;
const jsxTextRegex = />\s*([^<>{]+?)\s*</g;
const quotedPropRegex = new RegExp(`\\b(?:${visibleProps})\\s*=\\s*["'\`]([^"'\`]+)["'\`]`, 'g');
const objectPropRegex = new RegExp(`\\b(?:${visibleProps})\\s*:\\s*["'\`]([^"'\`]+)["'\`]`, 'g');

function extractCandidatesFromLine(line, fileExtension) {
  const candidates = [];
  const regexes = [];
  if (fileExtension === '.tsx' || fileExtension === '.html') {
    regexes.push(jsxTextRegex);
  }
  regexes.push(quotedPropRegex, objectPropRegex);

  for (const regex of regexes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(line))) {
      const text = String(match[1] || '').replace(/\s+/g, ' ').trim();
      if (text) {
        candidates.push(text);
      }
    }
  }
  return candidates;
}

function isLikelyTranslationKey(text) {
  return /^[A-Za-z0-9_.-]+$/.test(text) && text.includes('.');
}

function isTelemetryCode(text) {
  return /^[a-z0-9-]+(?::[a-z0-9-]+)+$/.test(text);
}

function isReasonCode(text) {
  return /^[A-Z0-9_]+$/.test(text);
}

function isRouteOrUrl(text) {
  return /^(\/|https?:\/\/|mailto:|#)/.test(text);
}

function isMostlyPunctuationOrNumber(text) {
  return !/[A-Za-z\u4E00-\u9FFF]/.test(text);
}

function isLikelyCodeFragment(text, line) {
  if (!text || !line) {
    return false;
  }
  if (text.includes('${')) {
    return true;
  }
  if (text.includes('&&') || text.includes('||') || text.includes('=>')) {
    return true;
  }
  if (text.includes('|') || text.startsWith(':') || text.startsWith('?') || text.startsWith('(')) {
    return true;
  }
  if (text.includes('Awaited') || text.includes('Promise') || text.includes('Set')) {
    return true;
  }
  if (text.includes('i18nText(') || text.includes('i18n.t(')) {
    return true;
  }
  if (/^(var\(|--|rgba?\(|color-mix\()/i.test(text)) {
    return true;
  }
  if (text.includes(' as ') || text.includes(' from ')) {
    return true;
  }
  if (!/[\u4E00-\u9FFF]/.test(text) && /^[a-z][a-z0-9_-]*$/.test(text)) {
    return true;
  }
  if (line.includes('import ') || line.includes('export ')) {
    return true;
  }
  if (text === 'Promise' && line.includes('Promise<')) {
    return true;
  }
  if (/^\s*[\w$]+\??:\s*\(\)\s*=>\s*[A-Z][A-Za-z0-9_]*</.test(line)) {
    return true;
  }
  if (/^[a-zA-Z_$][\w$]*:\s*[A-Z][A-Za-z0-9_<>,\s[\]|]*$/.test(text)) {
    return true;
  }
  if (!/[\u4E00-\u9FFF]/.test(text) && /^[a-z][a-z0-9_-]*$/.test(text) && /[<>{}?:]/.test(line)) {
    return true;
  }
  return false;
}

function isUserVisibleLiteral(text, line) {
  if (!text) {
    return false;
  }
  if (isMostlyPunctuationOrNumber(text)) {
    return false;
  }
  if (isLikelyTranslationKey(text) || isTelemetryCode(text) || isReasonCode(text) || isRouteOrUrl(text)) {
    return false;
  }
  if (isLikelyCodeFragment(text, line)) {
    return false;
  }
  return true;
}

function getPropertyNameText(name) {
  if (!name) {
    return null;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function getJsxAttributeNameText(name) {
  if (!name) {
    return null;
  }
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isJsxNamespacedName(name)) {
    return `${name.namespace.text}:${name.name.text}`;
  }
  return null;
}

function isI18nCall(node) {
  if (!node || !ts.isCallExpression(node)) {
    return false;
  }
  const expression = node.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text === 'i18nText' || expression.text === 't';
  }
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 't' &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'i18n'
  );
}

function expressionNameText(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = expressionNameText(expression.expression);
    return parent ? `${parent}.${expression.name.text}` : expression.name.text;
  }
  return null;
}

function hasAncestor(ancestors, predicate) {
  return ancestors.some(predicate);
}

function nearestAncestor(ancestors, predicate) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (predicate(ancestor)) {
      return ancestor;
    }
  }
  return null;
}

function nearestAncestorWithIndex(ancestors, predicate) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (predicate(ancestor)) {
      return { ancestor, index };
    }
  }
  return null;
}

function isVisiblePropertyLiteral(ancestors) {
  const property = nearestAncestor(ancestors, ts.isPropertyAssignment);
  if (!property) {
    return false;
  }
  const propertyName = getPropertyNameText(property.name);
  return Boolean(propertyName && visiblePropSet.has(propertyName));
}

function isVisibleJsxAttributeLiteral(ancestors) {
  const match = nearestAncestorWithIndex(ancestors, ts.isJsxAttribute);
  if (!match) {
    return false;
  }
  const attribute = match.ancestor;
  const attributeName = getJsxAttributeNameText(attribute.name);
  if (!attributeName || !visiblePropSet.has(attributeName)) {
    return false;
  }
  const nestedAncestors = ancestors.slice(match.index + 1);
  const nestedProperty = nearestAncestor(nestedAncestors, ts.isPropertyAssignment);
  if (!nestedProperty) {
    return true;
  }
  const propertyName = getPropertyNameText(nestedProperty.name);
  return Boolean(
    propertyName && (visiblePropSet.has(propertyName) || (attributeName === 'label' && propertyName === 'value')),
  );
}

function isJsxChildExpressionLiteral(ancestors) {
  const match = nearestAncestorWithIndex(ancestors, ts.isJsxExpression);
  if (!match) {
    return false;
  }
  const parent = ancestors[match.index - 1];
  if (!parent || (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent))) {
    return false;
  }
  const nestedJsxNodes = ancestors.slice(match.index + 1);
  if (
    nestedJsxNodes.some(
      (ancestor) =>
        ts.isArrowFunction(ancestor) ||
        ts.isFunctionExpression(ancestor) ||
        ts.isFunctionDeclaration(ancestor) ||
        ts.isBlock(ancestor) ||
        ts.isVariableDeclaration(ancestor) ||
        ts.isVariableStatement(ancestor) ||
        ts.isPropertyAssignment(ancestor) ||
        ts.isObjectLiteralExpression(ancestor),
    )
  ) {
    return false;
  }
  return !nestedJsxNodes.some(
    (ancestor) =>
      ts.isJsxElement(ancestor) ||
      ts.isJsxFragment(ancestor) ||
      ts.isJsxSelfClosingElement(ancestor) ||
      ts.isJsxOpeningElement(ancestor) ||
      ts.isJsxAttribute(ancestor),
  );
}

function isUserFeedbackCallLiteral(ancestors) {
  const call = nearestAncestor(ancestors, ts.isCallExpression);
  if (!call) {
    return false;
  }
  const callee = expressionNameText(call.expression);
  if (!callee) {
    return false;
  }
  if (callee === 'window.confirm' || callee === 'window.prompt' || callee === 'alert' || callee === 'window.alert') {
    return true;
  }
  const bareName = callee.split('.').at(-1) ?? callee;
  return USER_FEEDBACK_SETTER_PATTERN.test(bareName);
}

function hasExcludedAncestor(ancestors) {
  return hasAncestor(
    ancestors,
    (ancestor) =>
      ts.isImportDeclaration(ancestor) ||
      ts.isExportDeclaration(ancestor) ||
      ts.isImportSpecifier(ancestor) ||
      ts.isExportSpecifier(ancestor) ||
      ts.isLiteralTypeNode(ancestor) ||
      isI18nCall(ancestor),
  );
}

function isAuditedVisibleContext(ancestors) {
  return (
    isVisiblePropertyLiteral(ancestors) ||
    isVisibleJsxAttributeLiteral(ancestors) ||
    isJsxChildExpressionLiteral(ancestors) ||
    isUserFeedbackCallLiteral(ancestors)
  );
}

function hasNonVisibleJsxAttributeAncestor(ancestors) {
  const attribute = nearestAncestor(ancestors, ts.isJsxAttribute);
  if (!attribute) {
    return false;
  }
  const attributeName = getJsxAttributeNameText(attribute.name);
  return !attributeName || !visiblePropSet.has(attributeName);
}

function shouldAuditStringNode(node, ancestors, line) {
  const text = String(node.text || '').replace(/\s+/g, ' ').trim();
  if (!isUserVisibleLiteral(text, line)) {
    return false;
  }
  if (hasExcludedAncestor(ancestors)) {
    return false;
  }
  if (hasNonVisibleJsxAttributeAncestor(ancestors)) {
    return false;
  }
  return isAuditedVisibleContext(ancestors);
}

function shouldAuditTemplateNode(node, ancestors, line, sourceFile) {
  const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
  if (!text || !/[\u4E00-\u9FFF]/.test(text)) {
    return false;
  }
  if (isRouteOrUrl(text) || isTelemetryCode(text) || isReasonCode(text)) {
    return false;
  }
  if (line.includes('import ') || line.includes('export ')) {
    return false;
  }
  if (hasExcludedAncestor(ancestors)) {
    return false;
  }
  return isAuditedVisibleContext(ancestors);
}

function extractAstCandidates(source, filePath, fileExtension) {
  if (fileExtension !== '.ts' && fileExtension !== '.tsx') {
    return [];
  }
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileExtension === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const candidates = [];

  function visit(node, ancestors) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const line = source.split('\n')[lineNumber - 1] ?? '';
      const text = String(node.text || '').replace(/\s+/g, ' ').trim();
      if (text && shouldAuditStringNode(node, ancestors, line)) {
        candidates.push({ line: lineNumber, text });
      }
    }
    if (ts.isTemplateExpression(node)) {
      const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const line = source.split('\n')[lineNumber - 1] ?? '';
      const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
      if (text && shouldAuditTemplateNode(node, ancestors, line, sourceFile)) {
        candidates.push({ line: lineNumber, text });
      }
    }

    const nextAncestors = [...ancestors, node];
    ts.forEachChild(node, (child) => visit(child, nextAncestors));
  }

  visit(sourceFile, []);
  return candidates;
}

function addViolation(violations, seenViolations, violation) {
  const key = `${violation.file}:${violation.line}:${violation.text}`;
  if (seenViolations.has(key)) {
    return;
  }
  seenViolations.add(key);
  violations.push(violation);
}

function runAudit() {
  const config = loadConfig();
  if (config.scopeDirs.length === 0) {
    throw new Error('i18n audit must define at least one scopeDir.');
  }

  const allowRegexes = config.allowTextPatterns.map((pattern) => new RegExp(pattern));
  const violations = [];
  const seenViolations = new Set();
  const seenFiles = new Set();

  for (const scopeDir of config.scopeDirs) {
    const absolute = join(ROOT, scopeDir);
    for (const filePath of collectFiles(absolute)) {
      const extension = extname(filePath);
      if (!config.extensions.includes(extension)) {
        continue;
      }

      const rel = toPosixPath(relative(ROOT, filePath));
      if (seenFiles.has(rel)) {
        continue;
      }
      seenFiles.add(rel);
      if (shouldExcludeFile(rel, config.excludePathPatterns)) {
        continue;
      }

      const source = readFileSync(filePath, 'utf8');
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }
        if (line.includes('i18n.t(') || line.includes('useTranslation(')) {
          return;
        }

        for (const candidate of extractCandidatesFromLine(line, extension)) {
          if (!isUserVisibleLiteral(candidate, line)) {
            continue;
          }
          if (allowRegexes.some((regex) => regex.test(candidate))) {
            continue;
          }
          addViolation(violations, seenViolations, {
            file: rel,
            line: index + 1,
            text: candidate,
          });
        }
      });

      for (const candidate of extractAstCandidates(source, rel, extension)) {
        if (allowRegexes.some((regex) => regex.test(candidate.text))) {
          continue;
        }
        addViolation(violations, seenViolations, {
          file: rel,
          line: candidate.line,
          text: candidate.text,
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log('i18n:audit passed');
    return true;
  }

  console.error(`i18n:audit found ${violations.length} hardcoded user-facing literal(s):`);
  for (const violation of violations.slice(0, config.maxReportedViolations)) {
    console.error(` - ${violation.file}:${violation.line} -> ${violation.text}`);
  }
  if (violations.length > config.maxReportedViolations) {
    console.error(` ... and ${violations.length - config.maxReportedViolations} more`);
  }
  const byFile = new Map();
  for (const violation of violations) {
    byFile.set(violation.file, (byFile.get(violation.file) ?? 0) + 1);
  }
  const topFiles = [...byFile.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20);
  console.error('\nTop files by violation count:');
  for (const [file, count] of topFiles) {
    console.error(` - ${file}: ${count}`);
  }
  return false;
}

try {
  process.exit(runAudit() ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  console.error(`i18n:audit failed: ${message}`);
  process.exit(1);
}
