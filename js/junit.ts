import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CompareOutput } from './';

// Escape XML special characters in attribute / text content.
const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Render a JUnit XML report from a reg-cli `CompareOutput` and write it to
 * `path`. Minimal schema that matches what classic `reg-cli`'s
 * `src/report.js` produces via `xmlbuilder2`:
 *
 *   <testsuites>
 *     <testsuite name="reg-cli" tests="N" failures="M">
 *       <testcase name="<path>" classname="reg-cli" />     <-- passed
 *       <testcase name="<path>" classname="reg-cli">        <-- failed / new / deleted
 *         <failure message="<kind>" />
 *       </testcase>
 *     </testsuite>
 *   </testsuites>
 */
export async function writeJunit(
  path: string,
  data: CompareOutput,
): Promise<void> {
  const passed = data.passedItems ?? [];
  const failed = data.failedItems ?? [];
  const added = data.newItems ?? [];
  const deleted = data.deletedItems ?? [];

  const cases: string[] = [];
  for (const name of passed) {
    cases.push(`    <testcase classname="reg-cli" name="${esc(name)}"/>`);
  }
  for (const name of failed) {
    cases.push(
      `    <testcase classname="reg-cli" name="${esc(name)}">\n` +
        `      <failure message="changed" />\n` +
        `    </testcase>`,
    );
  }
  for (const name of added) {
    cases.push(
      `    <testcase classname="reg-cli" name="${esc(name)}">\n` +
        `      <failure message="new" />\n` +
        `    </testcase>`,
    );
  }
  for (const name of deleted) {
    cases.push(
      `    <testcase classname="reg-cli" name="${esc(name)}">\n` +
        `      <failure message="deleted" />\n` +
        `    </testcase>`,
    );
  }

  const tests = passed.length + failed.length + added.length + deleted.length;
  const failures = failed.length + added.length + deleted.length;

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites>\n` +
    `  <testsuite name="reg-cli" tests="${tests}" failures="${failures}">\n` +
    cases.join('\n') +
    `\n  </testsuite>\n` +
    `</testsuites>\n`;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, xml, 'utf8');
}
