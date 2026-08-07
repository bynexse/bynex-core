export type BynexReleaseInfo = {
  version: string;
  releaseId: string;
  environment: string;
  branch: string;
  commitSha: string;
  shortCommit: string;
  deploymentHost: string | null;
};

function clean(value: string | undefined, fallback: string, maximum: number) {
  const normalized = value?.trim().replace(/[\r\n\t]+/g, " ").slice(0, maximum);
  return normalized || fallback;
}

export function getBynexReleaseInfo(): BynexReleaseInfo {
  const version = clean(
    process.env.BYNEX_RELEASE_VERSION ?? process.env.npm_package_version,
    "1.2.0",
    40,
  );
  const commitSha = clean(
    process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA,
    "local",
    64,
  );
  const shortCommit = commitSha === "local" ? "local" : commitSha.slice(0, 8);
  const environment = clean(
    process.env.VERCEL_TARGET_ENV
      ?? process.env.VERCEL_ENV
      ?? process.env.NODE_ENV,
    "development",
    40,
  );
  const branch = clean(
    process.env.VERCEL_GIT_COMMIT_REF ?? process.env.GIT_BRANCH,
    "local",
    160,
  );
  const deploymentHost = clean(
    process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL,
    "",
    300,
  ) || null;

  return {
    version,
    releaseId: `${version}-${shortCommit}`,
    environment,
    branch,
    commitSha,
    shortCommit,
    deploymentHost,
  };
}
