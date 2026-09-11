/**
 * À LA PIÈCE — micro test harness (zero dependencies).
 *
 * Minimal `describe` / `test` / `expect` implementation executed directly by
 * `bun <file>.test.ts`. Exists so unit tests compile under the project's
 * strict tsc config without requiring a test-runner type package.
 */

type TestFn = () => void | Promise<void>;

interface TestCase {
  name: string;
  fn: TestFn;
}

interface Suite {
  name: string;
  tests: TestCase[];
}

const suites: Suite[] = [];
let current: Suite | null = null;

export function describe(name: string, register: () => void): void {
  current = { name, tests: [] };
  suites.push(current);
  register();
  current = null;
}

export function test(name: string, fn: TestFn): void {
  if (current) current.tests.push({ name, fn });
  else suites.push({ name: "", tests: [{ name, fn }] });
}

export class AssertionError extends Error {}

function render(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.length !== kb.length || !ka.every((k, i) => k === kb[i])) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

function isCloseTo(actual: number, expected: number, digits: number): boolean {
  const p = Math.pow(10, -digits);
  return Math.abs(actual - expected) < p / 2;
}

export function expect(actual: unknown) {
  const ok = (pass: boolean, message: string) => {
    if (!pass) throw new AssertionError(message);
  };
  const api = {
    toBe(expected: unknown) {
      ok(
        actual === expected,
        `expected ${render(actual)} to be ${render(expected)}`,
      );
    },
    toEqual(expected: unknown) {
      ok(deepEqual(actual, expected), `expected ${render(actual)} to equal ${render(expected)}`);
    },
    toBeCloseTo(expected: number, digits = 2) {
      ok(
        typeof actual === "number" && isCloseTo(actual, expected, digits),
        `expected ${render(actual)} to be close to ${expected} (${digits} digits)`,
      );
    },
    toContain(part: unknown) {
      const pass =
        typeof actual === "string"
          ? actual.includes(String(part))
          : Array.isArray(actual) && actual.some((v) => deepEqual(v, part));
      ok(pass, `expected ${render(actual)} to contain ${render(part)}`);
    },
    toMatch(pattern: RegExp) {
      ok(
        typeof actual === "string" && pattern.test(actual),
        `expected ${render(actual)} to match ${pattern}`,
      );
    },
    toBeNull() {
      ok(actual === null, `expected ${render(actual)} to be null`);
    },
    toBeDefined() {
      ok(actual !== undefined, `expected value to be defined`);
    },
    toBeUndefined() {
      ok(actual === undefined, `expected ${render(actual)} to be undefined`);
    },
    toBeTruthy() {
      ok(!!actual, `expected ${render(actual)} to be truthy`);
    },
    toBeFalsy() {
      ok(!actual, `expected ${render(actual)} to be falsy`);
    },
    toBeGreaterThan(n: number) {
      ok(
        typeof actual === "number" && actual > n,
        `expected ${render(actual)} to be greater than ${n}`,
      );
    },
    toBeGreaterThanOrEqual(n: number) {
      ok(
        typeof actual === "number" && actual >= n,
        `expected ${render(actual)} to be greater than or equal to ${n}`,
      );
    },
    toBeLessThan(n: number) {
      ok(
        typeof actual === "number" && actual < n,
        `expected ${render(actual)} to be less than ${n}`,
      );
    },
    toBeLessThanOrEqual(n: number) {
      ok(
        typeof actual === "number" && actual <= n,
        `expected ${render(actual)} to be less than or equal to ${n}`,
      );
    },
    not: {
      toBe(expected: unknown) {
        ok(actual !== expected, `expected ${render(actual)} NOT to be ${render(expected)}`);
      },
      toEqual(expected: unknown) {
        ok(!deepEqual(actual, expected), `expected values NOT to be equal`);
      },
      toContain(part: unknown) {
        const pass =
          typeof actual === "string"
            ? actual.includes(String(part))
            : Array.isArray(actual) && actual.some((v) => deepEqual(v, part));
        ok(!pass, `expected ${render(actual)} NOT to contain ${render(part)}`);
      },
      toMatch(pattern: RegExp) {
        ok(
          !(typeof actual === "string" && pattern.test(actual)),
          `expected ${render(actual)} NOT to match ${pattern}`,
        );
      },
    },
  };
  return api;
}

/** Execute all registered suites; exits non-zero on any failure. */
export async function runTests(file = "tests"): Promise<void> {
  let passed = 0;
  const failures: string[] = [];
  for (const suite of suites) {
    for (const t of suite.tests) {
      try {
        await t.fn();
        passed += 1;
      } catch (error) {
        failures.push(
          `${suite.name ? suite.name + " › " : ""}${t.name} — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
  const label = suites.reduce((n, s) => n + s.tests.length, 0);
  console.log(`\n[${file}] ${passed}/${label} passed, ${failures.length} failed`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  if (failures.length > 0) process.exit(1);
}
