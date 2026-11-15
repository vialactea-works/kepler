import type { UnitQueries } from "../construction/unit-queries.js";
import { HistoryError } from "../history/control.js";
import type { HistoryMutations, HistoryMutationSelection } from "../history/mutations.js";
import type { ProjectResolver } from "./project-selection.js";
import type { ScopeSelectors } from "./scope-selectors.js";

export class MissionMutations {
  public constructor(
    private readonly projects: Pick<ProjectResolver, "resolve">,
    private readonly units: Pick<UnitQueries, "readContext">,
    private readonly mutations: Pick<HistoryMutations, "execute">,
  ) {}

  public async execute<T>(
    selectors: ScopeSelectors,
    project: string | undefined,
    operation: () => Promise<T>,
  ): Promise<{ readonly value: T; readonly history: HistoryMutationSelection }> {
    if (selectors.unit !== undefined && selectors.mission !== undefined) throw new HistoryError("unit_and_mission_conflict", "A mutation must select one exact unit or mission scope.");
    if (selectors.unit !== undefined) {
      const context = await this.units.readContext(selectors.unit, project);
      if (context.kind === "failed") throw new HistoryError(context.code, context.message, context.details);
      return this.mutations.execute({ recordHome: context.recordHome, missionId: context.missionId, historyVersion: selectors.historyVersion }, operation);
    }
    if (selectors.mission !== undefined) {
      const selected = await this.projects.resolve(project);
      if (selected.kind === "failed") throw new HistoryError(selected.code, selected.message, selected.details);
      return this.mutations.execute({ recordHome: selected.root, missionId: selectors.mission, historyVersion: selectors.historyVersion }, operation);
    }
    throw new HistoryError("required_selector_missing", "A mission mutation requires an exact unit or mission selector.", { required: ["unit-or-mission", "historyVersion"] });
  }
}
