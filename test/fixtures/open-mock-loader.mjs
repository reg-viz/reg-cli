const mock = `
import { writeFile } from 'node:fs/promises';
export default async function open(target) {
  if (process.env.OPEN_ERROR) throw new Error(process.env.OPEN_ERROR);
  await writeFile(process.env.OPEN_LOG, target);
}
`;

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'open') {
    return { url: 'data:text/javascript,' + encodeURIComponent(mock), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
