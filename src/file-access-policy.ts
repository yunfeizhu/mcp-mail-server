import { constants } from 'fs';
import { lstat, mkdir, open, realpath, stat, unlink } from 'fs/promises';
import path from 'path';

import { isPathInsideAnyRoot } from './path-policy';

export interface FileAccessPolicyConfig {
  allowedRoots: string[];
  maxAttachmentBytes: number;
}

export class FileAccessPolicy {
  private rootsPromise: Promise<string[]> | null = null;

  constructor(private readonly config: FileAccessPolicyConfig) {}

  private getCanonicalRoots(): Promise<string[]> {
    if (!this.rootsPromise) {
      this.rootsPromise = (async () => {
        if (this.config.allowedRoots.length === 0) {
          throw new Error(
            'Filesystem access is disabled. Configure MAIL_ALLOWED_ROOTS before reading or writing attachments.',
          );
        }

        const roots: string[] = [];
        for (const configuredRoot of this.config.allowedRoots) {
          if (!path.isAbsolute(configuredRoot)) {
            throw new Error(`MAIL_ALLOWED_ROOTS entries must be absolute paths: ${configuredRoot}`);
          }
          const canonicalRoot = await realpath(configuredRoot);
          const rootStats = await stat(canonicalRoot);
          if (!rootStats.isDirectory()) {
            throw new Error(`MAIL_ALLOWED_ROOTS entry is not a directory: ${configuredRoot}`);
          }
          roots.push(canonicalRoot);
        }
        return roots;
      })();
    }
    return this.rootsPromise;
  }

  async getReadableAttachmentPath(filePath: string): Promise<{ path: string; size: number }> {
    const resolved = await this.resolveReadableAttachment(filePath);
    return resolved;
  }

  async readAttachmentFile(
    filePath: string,
  ): Promise<{ path: string; size: number; content: Buffer }> {
    const resolved = await this.resolveReadableAttachment(filePath);
    const allowedRoots = await this.getCanonicalRoots();
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
    const handle = await open(resolved.path, constants.O_RDONLY | noFollow);
    try {
      const fileStats = await handle.stat();
      if (!fileStats.isFile()) {
        throw new Error(`Attachment path is not a regular file: ${filePath}`);
      }
      const canonicalAfterOpen = await realpath(resolved.path);
      const pathStats = await stat(canonicalAfterOpen);
      if (
        !isPathInsideAnyRoot(canonicalAfterOpen, allowedRoots) ||
        pathStats.dev !== fileStats.dev ||
        pathStats.ino !== fileStats.ino
      ) {
        throw new Error(
          `Attachment path changed or resolved outside MAIL_ALLOWED_ROOTS while opening: ${filePath}`,
        );
      }
      if (fileStats.size > this.config.maxAttachmentBytes) {
        throw new Error(
          `Attachment ${filePath} exceeds the configured limit of ${this.config.maxAttachmentBytes} bytes`,
        );
      }
      const content = await handle.readFile();
      if (content.length > this.config.maxAttachmentBytes) {
        throw new Error(
          `Attachment ${filePath} exceeds the configured limit of ${this.config.maxAttachmentBytes} bytes`,
        );
      }
      return { path: resolved.path, size: content.length, content };
    } finally {
      await handle.close();
    }
  }

  private async resolveReadableAttachment(
    filePath: string,
  ): Promise<{ path: string; size: number }> {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`Attachment path must be absolute: ${filePath}`);
    }
    const allowedRoots = await this.getCanonicalRoots();
    const canonicalPath = await realpath(filePath);
    if (!isPathInsideAnyRoot(canonicalPath, allowedRoots)) {
      throw new Error(`Attachment path is outside MAIL_ALLOWED_ROOTS: ${filePath}`);
    }
    const fileStats = await stat(canonicalPath);
    if (!fileStats.isFile()) {
      throw new Error(`Attachment path is not a regular file: ${filePath}`);
    }
    if (fileStats.size > this.config.maxAttachmentBytes) {
      throw new Error(
        `Attachment ${filePath} exceeds the configured limit of ${this.config.maxAttachmentBytes} bytes`,
      );
    }
    return { path: canonicalPath, size: fileStats.size };
  }

  async prepareWritableDirectory(directoryPath: string): Promise<string> {
    if (!path.isAbsolute(directoryPath)) {
      throw new Error(`Save path must be absolute: ${directoryPath}`);
    }
    const allowedRoots = await this.getCanonicalRoots();
    const resolvedDirectory = path.resolve(directoryPath);
    const configuredRoots = this.config.allowedRoots.map(root => path.resolve(root));
    const rootMatches = configuredRoots
      .flatMap((configuredRoot, index) => {
        const candidates = [configuredRoot, allowedRoots[index]];
        return candidates
          .filter((candidate, candidateIndex) => candidates.indexOf(candidate) === candidateIndex)
          .filter(candidate => isPathInsideAnyRoot(resolvedDirectory, [candidate]))
          .map(candidate => ({ index, candidate }));
      })
      .sort((left, right) => right.candidate.length - left.candidate.length);
    const rootMatch = rootMatches[0];
    if (!rootMatch) {
      throw new Error(`Save path is outside MAIL_ALLOWED_ROOTS: ${directoryPath}`);
    }

    const canonicalRoot = allowedRoots[rootMatch.index];
    const relativeSegments = path
      .relative(rootMatch.candidate, resolvedDirectory)
      .split(path.sep)
      .filter(Boolean);
    let currentDirectory = canonicalRoot;

    for (const segment of relativeSegments) {
      const candidate = path.join(currentDirectory, segment);
      try {
        const candidateStats = await lstat(candidate);
        if (candidateStats.isSymbolicLink()) {
          const canonicalCandidate = await realpath(candidate);
          const targetStats = await stat(canonicalCandidate);
          if (
            !targetStats.isDirectory() ||
            !isPathInsideAnyRoot(canonicalCandidate, allowedRoots)
          ) {
            throw new Error(`Save path resolves outside MAIL_ALLOWED_ROOTS: ${directoryPath}`);
          }
          currentDirectory = canonicalCandidate;
        } else if (candidateStats.isDirectory()) {
          currentDirectory = candidate;
        } else {
          throw new Error(`Save path component is not a directory: ${candidate}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await mkdir(candidate);
        const canonicalCandidate = await realpath(candidate);
        if (!isPathInsideAnyRoot(canonicalCandidate, allowedRoots)) {
          throw new Error(`Save path resolves outside MAIL_ALLOWED_ROOTS: ${directoryPath}`, {
            cause: error,
          });
        }
        currentDirectory = canonicalCandidate;
      }
    }

    return currentDirectory;
  }

  async writeNewFile(directoryPath: string, filename: string, content: Buffer): Promise<string> {
    if (!Buffer.isBuffer(content)) {
      throw new Error('Attachment content must be a Buffer');
    }
    if (content.length > this.config.maxAttachmentBytes) {
      throw new Error(
        `Attachment ${filename} exceeds the configured limit of ${this.config.maxAttachmentBytes} bytes`,
      );
    }

    const safeFilename = path.basename(filename).trim() || 'attachment';
    const extension = path.extname(safeFilename);
    const nameWithoutExtension = path.basename(safeFilename, extension) || 'attachment';
    const allowedRoots = await this.getCanonicalRoots();
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;

    for (let counter = 0; counter <= 10_000; counter += 1) {
      // Re-resolve the user-supplied directory immediately before every open.
      // The post-open inode check below then catches a parent-directory swap
      // that occurs between this validation and the exclusive file creation.
      const writableDirectory = await this.prepareWritableDirectory(directoryPath);
      const candidateName =
        counter === 0 ? safeFilename : `${nameWithoutExtension}_${counter}${extension}`;
      const targetPath = path.join(writableDirectory, candidateName);
      let handle;
      let handleClosed = false;

      try {
        handle = await open(
          targetPath,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow,
          0o600,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw error;
      }

      const openedStats = await handle.stat();
      try {
        if (!openedStats.isFile() || openedStats.nlink !== 1) {
          throw new Error(
            `Refusing to write attachment through a non-regular or multiply-linked file: ${targetPath}`,
          );
        }

        const canonicalTarget = await realpath(targetPath);
        const targetStats = await stat(canonicalTarget);
        if (
          !isPathInsideAnyRoot(canonicalTarget, allowedRoots) ||
          targetStats.dev !== openedStats.dev ||
          targetStats.ino !== openedStats.ino
        ) {
          throw new Error(
            `Save path changed or resolved outside MAIL_ALLOWED_ROOTS while creating: ${directoryPath}`,
          );
        }

        await handle.writeFile(content);
        return canonicalTarget;
      } catch (error) {
        await handle.close();
        handleClosed = true;
        await this.cleanupCreatedFile(targetPath, openedStats.dev, openedStats.ino);
        throw error;
      } finally {
        if (!handleClosed) await handle.close();
      }
    }

    throw new Error(`Could not choose an unused filename for attachment: ${safeFilename}`);
  }

  private async cleanupCreatedFile(
    targetPath: string,
    device: number,
    inode: number,
  ): Promise<void> {
    try {
      const targetStats = await lstat(targetPath);
      if (targetStats.dev === device && targetStats.ino === inode) {
        await unlink(targetPath);
      }
    } catch {
      // Best effort: the path may already have been moved or removed.
    }
  }
}
