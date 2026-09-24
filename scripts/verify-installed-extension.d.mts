/**
 * Types for `verify-installed-extension.mjs`, which stays plain JavaScript so
 * the install script can run it with `node` without a build step.
 */

export declare function installedExtensionDir(
  extensionsDir: string,
  extensionId: string,
  version: string,
): string;

export declare function fileDigest(path: string): string;

export type InstalledBuildCheck = {
  ok: boolean;
  /** Directory the check looked in, so a failure points at a real path. */
  installedDir: string;
  reason?: string;
  built?: string;
  installed?: string;
};

export declare function verifyInstalledExtension(input: {
  extensionsDir: string;
  extensionId: string;
  version: string;
  builtBundle: string;
}): InstalledBuildCheck;
