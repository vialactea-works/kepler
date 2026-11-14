import { AsyncLocalStorage } from "node:async_hooks";
import * as Path from "node:path";
import type { AuditJournalFactory } from "../audit/context.js";
import { CONSTRUCTION_PHASE } from "../construction/events.js";
import type { ConstructionJournals } from "../construction/journals.js";
import type { HistoryAccess, HistoryMutationRequest, HistoryWriterLease } from "./access.js";
import { HistoryError } from "./control.js";
import { createEventJournal } from "./journal.js";

export interface HistoryMutationSelection {
  readonly mission_id: string;
  readonly history_version: string;
  readonly generation_id: string;
}

interface MutationContext {
  readonly recordHome: string;
  readonly selection: HistoryMutationSelection;
  readonly writer: HistoryWriterLease;
  live: boolean;
}

export class HistoryMutations {
  private readonly current = new AsyncLocalStorage<MutationContext>();
  public readonly journals: ConstructionJournals;
  public readonly auditJournals: AuditJournalFactory;

  public constructor(private readonly access: Pick<HistoryAccess, "withMutation">) {
    const active = (): MutationContext => this.active();
    this.journals = {
      get generationId() { return active().selection.generation_id; },
      create: (recordHome, missionId, journalId) => {
        const context = this.active(recordHome, missionId);
        const journal = createEventJournal({
          recordHome: context.recordHome,
          missionId: context.selection.mission_id,
          generationId: context.selection.generation_id,
          phase: CONSTRUCTION_PHASE,
          journalId,
        });
        const verify = async (): Promise<void> => {
          if (this.active(recordHome, missionId) !== context) throw new HistoryError("history_mutation_scope_mismatch", "The journal belongs to another admitted mutation.");
          await context.writer.assertHeld();
        };
        return {
          path: journal.path,
          read: async () => { await verify(); return journal.read(); },
          append: async (event) => { await verify(); return journal.append(event); },
        };
      },
    };
    this.auditJournals = {
      create: (request) => {
        const context = this.active(request.recordHome, request.missionId);
        if (request.phase !== CONSTRUCTION_PHASE || request.historyVersion !== context.selection.history_version || request.generationId !== context.selection.generation_id) throw new HistoryError("history_mutation_scope_mismatch", "The audit journal does not match its admitted phase, history version and generation.");
        return this.journals.create(request.recordHome, request.missionId, request.journalId);
      },
    };
  }

  public async execute<T>(
    request: HistoryMutationRequest,
    operation: () => Promise<T>,
  ): Promise<{ readonly value: T; readonly history: HistoryMutationSelection }> {
    if (this.current.getStore()) throw new HistoryError("history_mutation_nested", "A history mutation cannot silently replace an admitted invocation.");
    const input = Object.freeze({ recordHome: request.recordHome, missionId: request.missionId, historyVersion: request.historyVersion });
    return this.access.withMutation(input, async (view, writer) => {
      if (view.mode !== "active" || !view.historyVersion || !view.generationId || view.historyVersion !== input.historyVersion) throw new HistoryError("history_mutation_unbound", "The admitted mutation has no exact active generation binding.");
      const context: MutationContext = {
        recordHome: Path.resolve(input.recordHome),
        selection: Object.freeze({ mission_id: input.missionId, history_version: view.historyVersion, generation_id: view.generationId }),
        writer,
        live: true,
      };
      try {
        return await this.current.run(context, async () => {
          await writer.assertHeld();
          const value = await operation();
          await writer.assertHeld();
          return { value, history: context.selection };
        });
      } finally {
        context.live = false;
      }
    });
  }

  private active(recordHome?: string, missionId?: string): MutationContext {
    const context = this.current.getStore();
    if (!context?.live) throw new HistoryError("history_mutation_required", "Generation journals require a live, explicitly versioned mutation admission.");
    if ((recordHome !== undefined && Path.resolve(recordHome) !== context.recordHome) || (missionId !== undefined && missionId !== context.selection.mission_id)) throw new HistoryError("history_mutation_scope_mismatch", "The journal does not belong to this mutation's record home and mission.");
    return context;
  }
}
