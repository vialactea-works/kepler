import { createHash } from "node:crypto";

export const missionStartupResourceKey = (commonDirectory: string, missionId: string): string => createHash("sha256").update(`mission-startup\0${commonDirectory}\0${missionId}`).digest("hex");
