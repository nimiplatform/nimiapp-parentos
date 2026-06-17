#!/usr/bin/env node
/* global console, process */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG_PATH = join(ROOT, 'scripts', 'i18n.config.json');

function toPosixPath(pathLike) {
  return pathLike.replaceAll('\\', '/');
}

function formatPath(pathLike) {
  return toPosixPath(relative(ROOT, pathLike));
}

function loadJson(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing JSON file: ${formatPath(filePath)}`);
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    throw new Error(`Invalid JSON in ${formatPath(filePath)}: ${message}`, { cause: error });
  }
}

function flattenEntries(value, prefix = '') {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return [[prefix, value]];
  }

  const entries = [];
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    entries.push(...flattenEntries(child, fullKey));
  }
  return entries;
}

function loadConfig() {
  const parsed = loadJson(CONFIG_PATH);
  const supportedLocales = Array.isArray(parsed.supportedLocales)
    ? parsed.supportedLocales.filter((locale) => typeof locale === 'string' && locale.trim().length > 0)
    : [];
  const bundles = Array.isArray(parsed.bundles) ? parsed.bundles : [];

  if (!supportedLocales.includes('en') || !supportedLocales.includes('zh')) {
    throw new Error('i18n config must include supportedLocales "en" and "zh".');
  }
  if (bundles.length === 0) {
    throw new Error('i18n config must define at least one locale bundle.');
  }

  return { supportedLocales, bundles };
}

function validateBundleShape(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Each i18n bundle config must be an object.');
  }
  if (typeof bundle.name !== 'string' || bundle.name.trim().length === 0) {
    throw new Error('Each i18n bundle config must include a non-empty name.');
  }
  if (typeof bundle.baseLocale !== 'string' || bundle.baseLocale.trim().length === 0) {
    throw new Error(`Bundle ${bundle.name} must include baseLocale.`);
  }
  if (!bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) {
    throw new Error(`Bundle ${bundle.name} must include files by locale.`);
  }
}

function analyzeLeafValues(entries, locale, bundleName) {
  const failures = [];
  for (const [key, value] of entries) {
    const ref = `${bundleName}/${locale}:${key}`;
    if (typeof value !== 'string') {
      failures.push(`${ref} must be a string leaf`);
      continue;
    }
    if (value.trim().length === 0) {
      failures.push(`${ref} must not be empty`);
      continue;
    }
    if (/\b(TODO|TBD|FIXME)\b/i.test(value)) {
      failures.push(`${ref} contains TODO/TBD/FIXME copy`);
    }
  }
  return failures;
}

function analyzeNamespaceShape(root, locale, bundleName) {
  const failures = [];
  if (root && typeof root === 'object' && !Array.isArray(root) && Object.prototype.hasOwnProperty.call(root, 'Hardcoded')) {
    failures.push(`${bundleName}/${locale} must not contain legacy Hardcoded namespace`);
  }
  return failures;
}

function compareBundle({ bundle, supportedLocales }) {
  validateBundleShape(bundle);
  const baseLocale = bundle.baseLocale;
  if (!supportedLocales.includes(baseLocale)) {
    throw new Error(`Bundle ${bundle.name} baseLocale ${baseLocale} is not in supportedLocales.`);
  }

  const loaded = new Map();
  for (const locale of supportedLocales) {
    const relPath = bundle.files[locale];
    if (typeof relPath !== 'string' || relPath.trim().length === 0) {
      throw new Error(`Bundle ${bundle.name} is missing file path for locale ${locale}.`);
    }
    loaded.set(locale, loadJson(join(ROOT, relPath)));
  }

  const baseRoot = loaded.get(baseLocale);
  const baseEntries = flattenEntries(baseRoot);
  const baseKeys = new Set(baseEntries.map(([key]) => key));
  const failures = [
    ...analyzeNamespaceShape(baseRoot, baseLocale, bundle.name),
    ...analyzeLeafValues(baseEntries, baseLocale, bundle.name),
  ];

  console.log(`i18n:check [${bundle.name}] base ${baseLocale}: ${baseKeys.size} keys`);

  for (const locale of supportedLocales) {
    if (locale === baseLocale) {
      continue;
    }

    const localeRoot = loaded.get(locale);
    const entries = flattenEntries(localeRoot);
    const localeKeys = new Set(entries.map(([key]) => key));
    const missing = [...baseKeys].filter((key) => !localeKeys.has(key)).sort();
    const extra = [...localeKeys].filter((key) => !baseKeys.has(key)).sort();
    const leafFailures = [
      ...analyzeNamespaceShape(localeRoot, locale, bundle.name),
      ...analyzeLeafValues(entries, locale, bundle.name),
    ];

    failures.push(...missing.map((key) => `${bundle.name}/${locale} missing key: ${key}`));
    failures.push(...extra.map((key) => `${bundle.name}/${locale} orphan key: ${key}`));
    failures.push(...leafFailures);

    const status = missing.length === 0 && extra.length === 0 && leafFailures.length === 0 ? 'ok' : 'failed';
    console.log(
      `i18n:check [${bundle.name}] ${locale}: ${localeKeys.size} keys, missing ${missing.length}, orphan ${extra.length}, leaf failures ${leafFailures.length} (${status})`,
    );
  }

  return failures;
}

try {
  const config = loadConfig();
  const failures = [];
  for (const bundle of config.bundles) {
    failures.push(...compareBundle({ bundle, supportedLocales: config.supportedLocales }));
  }

  if (failures.length > 0) {
    console.error(`\ni18n:check failed with ${failures.length} issue(s):`);
    for (const failure of failures.slice(0, 160)) {
      console.error(` - ${failure}`);
    }
    if (failures.length > 160) {
      console.error(` ... and ${failures.length - 160} more`);
    }
    process.exit(1);
  }

  console.log('\ni18n:check passed');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  console.error(`i18n:check failed: ${message}`);
  process.exit(1);
}
