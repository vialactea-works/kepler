import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { lockSync } from "proper-lockfile";

const ownerFileName = "kepler-owner";
const heartbeatMilliseconds = 5_000;

type DirectoryIdentity = Pick<Fs.Stats, "dev" | "ino">;

export interface PiSettingsLock {
  release(): void;
}

export function acquirePiSettingsLock(settingsPath: string): PiSettingsLock {
  const settings = Path.resolve(settingsPath);
  const claimPath = `${settings}.lock`;
  const ownerPath = Path.join(claimPath, ownerFileName);
  const ownerToken = randomUUID();
  let claimIdentity: DirectoryIdentity | undefined;

  const ownsClaim = (): boolean => {
    if (!claimIdentity) return false;
    try {
      const current = Fs.lstatSync(claimPath);
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        !sameIdentity(current, claimIdentity)
      ) {
        return false;
      }
      const entries = Fs.readdirSync(claimPath);
      if (entries.length !== 1 || entries[0] !== ownerFileName) return false;
      const owner = Fs.lstatSync(ownerPath);
      return (
        owner.isFile() &&
        !owner.isSymbolicLink() &&
        Fs.readFileSync(ownerPath, "utf8") === ownerToken
      );
    } catch {
      return false;
    }
  };

  const compromised = (): NodeJS.ErrnoException => {
    const error = new Error("Native Pi settings lock holder changed") as NodeJS.ErrnoException;
    error.code = "ECOMPROMISED";
    return error;
  };
  const matchesClaimPath = (path: Fs.PathLike): boolean =>
    Path.resolve(path.toString()) === claimPath;

  const guardedFs = {
    ...Fs,
    mkdirSync(...arguments_: Parameters<typeof Fs.mkdirSync>) {
      const [path] = arguments_;
      const result = Fs.mkdirSync(...arguments_);
      if (matchesClaimPath(path)) {
        const identity = Fs.lstatSync(claimPath);
        if (!identity.isDirectory() || identity.isSymbolicLink()) {
          throw compromised();
        }
        claimIdentity = identity;
        Fs.writeFileSync(ownerPath, ownerToken, { flag: "wx", mode: 0o600 });
        if (!ownsClaim()) throw compromised();
      }
      return result;
    },
    rmdirSync(...arguments_: Parameters<typeof Fs.rmdirSync>) {
      const [path] = arguments_;
      if (matchesClaimPath(path)) {
        if (!ownsClaim()) throw compromised();
        Fs.unlinkSync(ownerPath);
        if (!claimIdentity || !sameIdentity(Fs.lstatSync(claimPath), claimIdentity)) {
          throw compromised();
        }
      }
      return Fs.rmdirSync(...arguments_);
    },
  };

  const release = lockSync(settings, {
    realpath: false,
    stale: Number.POSITIVE_INFINITY,
    update: heartbeatMilliseconds,
    fs: guardedFs as typeof Fs,
  });

  return { release };
}

function sameIdentity(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}
