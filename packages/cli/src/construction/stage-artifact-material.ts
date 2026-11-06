import type { RepositoryArtifactFileSystem } from "./artifacts.js";
import { NodeConstructionMaterialReader } from "./node-material-reader.js";
import type { StageArtifactMaterialRequest } from "./material-reader.js";

export type { StageArtifactMaterial, StageArtifactMaterialRequest } from "./material-reader.js";
export type StageArtifactMaterialResult = Awaited<ReturnType<NodeConstructionMaterialReader["readStageArtifactMaterial"]>>;

export const readStageArtifactMaterial = (
  request: StageArtifactMaterialRequest,
  fileSystem: RepositoryArtifactFileSystem,
): ReturnType<NodeConstructionMaterialReader["readStageArtifactMaterial"]> =>
  new NodeConstructionMaterialReader(fileSystem).readStageArtifactMaterial(request);
