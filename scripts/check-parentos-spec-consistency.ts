/**
 * Validates ParentOS's current v2 authority consumers:
 * - canonical authority landing exists
 * - data/structured routes ↔ routes.tsx ↔ shell-layout.tsx stay bidirectionally aligned
 * - data/structured local storage ↔ SQLite migration DDL stay aligned
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

export interface SpecRoute {
  path: string;
  nav?: boolean;
  isDefault?: boolean;
  parent?: string;
  feature?: string;
}

interface StorageTable {
  name: string;
  columns: Array<{ name: string; description?: string }>;
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function extractRouterPaths(source: string) {
  const paths: string[] = [];
  const regex = /path\s*=\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(regex)) {
    if (match[1] && match[1] !== '*') paths.push(match[1]);
  }
  return uniqueSorted(paths);
}

export function extractNavPaths(source: string) {
  const paths: string[] = [];
  const regex = /to:\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(regex)) {
    if (match[1]) paths.push(match[1]);
  }
  return uniqueSorted(paths);
}

export function findRouteConsistencyErrors(input: {
  routes: SpecRoute[];
  routerSource: string;
  navSource: string;
  canonicalAuthorityExists: boolean;
}) {
  const errors: string[] = [];

  if (!input.canonicalAuthorityExists) {
    errors.push(
      '.nimi/spec/parentos/canonical/project.authority.yaml is missing — v2 authority landing is incomplete',
    );
  }

  const specPaths = uniqueSorted(input.routes.map((route) => route.path));
  const routerPaths = extractRouterPaths(input.routerSource);
  const specNavPaths = uniqueSorted(
    input.routes.filter((route) => route.nav === true).map((route) => route.path),
  );
  const navPaths = extractNavPaths(input.navSource);

  for (const path of specPaths) {
    if (!routerPaths.includes(path)) {
      errors.push(
        `Route ${path} defined in data/structured/parentos/routes.yaml but missing from routes.tsx`,
      );
    }
  }

  for (const path of routerPaths) {
    if (!specPaths.includes(path)) {
      errors.push(
        `Route ${path} is registered in routes.tsx but missing from data/structured/parentos/routes.yaml`,
      );
    }
  }

  for (const path of specNavPaths) {
    if (!navPaths.includes(path)) {
      errors.push(
        `Nav route ${path} defined in data/structured/parentos/routes.yaml but missing from shell-layout.tsx`,
      );
    }
  }

  for (const path of navPaths) {
    if (!specNavPaths.includes(path)) {
      errors.push(
        `Nav route ${path} is exposed in shell-layout.tsx but missing nav: true authority in data/structured/parentos/routes.yaml`,
      );
    }
  }

  return errors;
}

export function findRouteTableConstraintErrors(routes: SpecRoute[]) {
  const errors: string[] = [];
  const defaultRoutes = routes.filter((route) => route.isDefault === true);

  if (defaultRoutes.length !== 1) {
    errors.push(
      `data/structured/parentos/routes.yaml must declare exactly one isDefault route, found ${defaultRoutes.length}`,
    );
  }

  const routeByPath = new Map(routes.map((route) => [route.path, route]));
  for (const route of routes) {
    if (!route.parent) continue;

    const parentRoute = routeByPath.get(route.parent);
    if (!parentRoute) {
      errors.push(`Route ${route.path} declares missing parent route ${route.parent}`);
      continue;
    }

    if (route.feature && parentRoute.feature && route.feature !== parentRoute.feature) {
      errors.push(
        `Route ${route.path} feature ${route.feature} does not match parent ${route.parent} feature ${parentRoute.feature}`,
      );
    }
  }

  return errors;
}

export function findStorageConsistencyErrors(input: {
  storageTables: StorageTable[];
  migrationsSqlSources: string;
}) {
  const errors: string[] = [];

  for (const table of input.storageTables) {
    const tableRegex = new RegExp(
      `CREATE TABLE IF NOT EXISTS ${table.name}\\s*\\(([^;]+?)\\);`,
      's',
    );
    const match = input.migrationsSqlSources.match(tableRegex);

    if (!match) {
      errors.push(`Table '${table.name}' not found in sqlite migrations`);
      continue;
    }

    const ddl = match[1];
    for (const column of table.columns) {
      const addColumnRegex = new RegExp(
        `ALTER TABLE ${table.name} ADD COLUMN ${column.name}\\b`,
        'i',
      );
      if (!ddl.includes(column.name) && !addColumnRegex.test(input.migrationsSqlSources)) {
        errors.push(`Column '${table.name}.${column.name}' missing from sqlite migrations`);
      }
    }
  }

  return errors;
}

function parsePipeSeparatedAllowedSet(value: string) {
  return uniqueSorted(
    value
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function extractQuotedStringValues(source: string) {
  const values: string[] = [];
  for (const match of source.matchAll(/['"]([^'"]+)['"]/g)) {
    if (match[1]) values.push(match[1]);
  }
  return uniqueSorted(values);
}

export function findGrowthReportTypeConsistencyErrors(input: {
  storageTables: StorageTable[];
  structuredReportSource: string;
  rustGrowthReportSource: string;
}) {
  const errors: string[] = [];

  const growthReportsTable = input.storageTables.find((table) => table.name === 'growth_reports');
  const reportTypeColumn = growthReportsTable?.columns.find(
    (column) => column.name === 'reportType',
  );
  if (!reportTypeColumn?.description) {
    return [
      'growth_reports.reportType description is missing from data/structured/parentos/local-storage.yaml',
    ];
  }

  const specAllowedSet = parsePipeSeparatedAllowedSet(reportTypeColumn.description);
  const tsMatch = input.structuredReportSource.match(
    /const GROWTH_REPORT_TYPES = \[(.*?)\] as const/s,
  );
  if (!tsMatch) {
    errors.push('structured-report.ts is missing GROWTH_REPORT_TYPES');
    return errors;
  }
  const tsAllowedSet = extractQuotedStringValues(tsMatch[1] ?? '');

  const rustMatch = input.rustGrowthReportSource.match(
    /matches!\(\s*report_type,\s*([^)]+)\)/s,
  );
  if (!rustMatch) {
    errors.push('health_measurements.rs is missing is_supported_growth_report_type matches! helper');
    return errors;
  }
  const rustAllowedSet = extractQuotedStringValues(rustMatch[1] ?? '');

  const specKey = specAllowedSet.join(', ');
  const tsKey = tsAllowedSet.join(', ');
  const rustKey = rustAllowedSet.join(', ');

  if (specKey !== tsKey) {
    errors.push(
      `growth_reports.reportType mismatch between data/structured/parentos/local-storage.yaml and structured-report.ts: spec=[${specKey}] ts=[${tsKey}]`,
    );
  }

  if (specKey !== rustKey) {
    errors.push(
      `growth_reports.reportType mismatch between data/structured/parentos/local-storage.yaml and health_measurements.rs: spec=[${specKey}] rust=[${rustKey}]`,
    );
  }

  return errors;
}

export function runSpecConsistencyCheck() {
  const routesYaml = parseYaml(
    readFileSync(resolve(ROOT, 'data/structured/parentos/routes.yaml'), 'utf-8'),
  ) as { routes: SpecRoute[] };

  const routerSource = readFileSync(
    resolve(ROOT, 'src/shell/renderer/app-shell/routes.tsx'),
    'utf-8',
  );
  const navSource = readFileSync(
    resolve(ROOT, 'src/shell/renderer/app-shell/shell-layout.tsx'),
    'utf-8',
  );
  const canonicalAuthorityExists = existsSync(
    resolve(ROOT, '.nimi/spec/parentos/canonical/project.authority.yaml'),
  );

  const routeErrors = [
    ...findRouteTableConstraintErrors(routesYaml.routes),
    ...findRouteConsistencyErrors({
      routes: routesYaml.routes,
      routerSource,
      navSource,
      canonicalAuthorityExists,
    }),
  ];

  const storageYaml = parseYaml(
    readFileSync(resolve(ROOT, 'data/structured/parentos/local-storage.yaml'), 'utf-8'),
  ) as { tables: StorageTable[] };

  const sqliteDir = resolve(ROOT, 'src-tauri/src/sqlite');
  const migrationsSqlSources = readdirSync(sqliteDir)
    .filter(
      (entry) => entry === 'migrations.rs' || /^migrations(?:_schema|_v\d+)\.rs$/.test(entry),
    )
    .map((entry) => resolve(sqliteDir, entry))
    .map((path) => readFileSync(path, 'utf-8'))
    .join('\n');

  const storageErrors = findStorageConsistencyErrors({
    storageTables: storageYaml.tables,
    migrationsSqlSources,
  });

  const reportTypeErrors = findGrowthReportTypeConsistencyErrors({
    storageTables: storageYaml.tables,
    structuredReportSource: readFileSync(
      resolve(ROOT, 'src/shell/renderer/features/reports/structured-report.ts'),
      'utf-8',
    ),
    rustGrowthReportSource: readFileSync(
      resolve(ROOT, 'src-tauri/src/sqlite/queries/health_measurements.rs'),
      'utf-8',
    ),
  });

  return { routeErrors, storageErrors, reportTypeErrors };
}

function pass(message: string) {
  console.log(`  PASS: ${message}`);
}

function fail(message: string) {
  console.error(`  FAIL: ${message}`);
}

function isMainModule() {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  console.log('\n=== Route Consistency ===\n');
  const { routeErrors, storageErrors, reportTypeErrors } = runSpecConsistencyCheck();

  if (routeErrors.length === 0) {
    pass(
      'canonical authority, data/structured routes, routes.tsx, and shell-layout.tsx are aligned',
    );
  } else {
    for (const message of routeErrors) fail(message);
  }

  console.log('\n=== Local Storage ↔ Migrations ===\n');
  if (storageErrors.length === 0) {
    pass('data/structured local storage and sqlite migrations are aligned');
  } else {
    for (const message of storageErrors) fail(message);
  }

  console.log('\n=== Growth Report Allowed Set ===\n');
  if (reportTypeErrors.length === 0) {
    pass('growth_reports.reportType stays aligned across structured data, TS, and Rust');
  } else {
    for (const message of reportTypeErrors) fail(message);
  }

  const errorCount = routeErrors.length + storageErrors.length + reportTypeErrors.length;
  console.log(`\n${errorCount === 0 ? 'All checks passed.' : `${errorCount} error(s) found.`}\n`);
  process.exit(errorCount > 0 ? 1 : 0);
}
