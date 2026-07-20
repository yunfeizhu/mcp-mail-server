import { mkdir, realpath, stat } from 'fs/promises';
import path from 'path';

import { isPathInsideAnyRoot } from './path-policy.js';

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
          throw new Error('Filesystem access is disabled. Configure MAIL_ALLOWED_ROOTS before reading or writing attachments.');
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
      throw new Error(`Attachment ${filePath} exceeds the configured limit of ${this.config.maxAttachmentBytes} bytes`);
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
    if (!isPathInsideAnyRoot(resolvedDirectory, configuredRoots)) {
      throw new Error(`Save path is outside MAIL_ALLOWED_ROOTS: ${directoryPath}`);
    }

    await mkdir(resolvedDirectory, { recursive: true });
    const canonicalDirectory = await realpath(resolvedDirectory);
    if (!isPathInsideAnyRoot(canonicalDirectory, allowedRoots)) {
      throw new Error(`Save path resolves outside MAIL_ALLOWED_ROOTS: ${directoryPath}`);
    }
    return canonicalDirectory;
  }
}
