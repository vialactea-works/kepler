export const isFullTargetBranchReference = (value: string): boolean =>
  /^refs\/(?:heads|remotes)\/[A-Za-z0-9._/-]+$/.test(value) &&
  !value.includes("..") &&
  !value.endsWith("/");
