import path from 'path';

export function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function isPathInsideAnyRoot(candidatePath: string, rootPaths: string[]): boolean {
  return rootPaths.some(rootPath => isPathInsideRoot(candidatePath, rootPath));
}
