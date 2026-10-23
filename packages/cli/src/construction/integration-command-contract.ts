import type { PlannedIntegrationCommand } from "./events.js";
import type { TaskGraphTask } from "./task-graph.js";

const checkDefinitions = [
  { check: "code-integration-typecheck", mentions: /type[ -]?check|typechecking/i },
  { check: "code-integration-build", mentions: /\bbuild\b/i },
  { check: "code-integration-full-test-suite", mentions: /\b(full|complete|entire|application)\b/i, tests: /\btests?\b/i },
] as const;

const safeCommandWord = (value: string): boolean => /^[A-Za-z0-9_./:@+=,-]+$/.test(value);

const commandsIn = (source: string): readonly Omit<PlannedIntegrationCommand, "check">[] => {
  const commands: Omit<PlannedIntegrationCommand, "check">[] = [];
  for (const match of source.matchAll(/`([^`]+)`/g)) {
    const content = match[1];
    if (!content) continue;
    const separator = content.indexOf(": ");
    if (separator <= 0) continue;
    const repository_id = content.slice(0, separator);
    const words = content.slice(separator + 2).trim().split(/\s+/);
    if (!safeCommandWord(repository_id) || words.length === 0 || !words.every(safeCommandWord)) continue;
    commands.push({ repository_id, executable: words[0]!, argv: words.slice(1) });
  }
  return commands;
};

const mentionsCheck = (source: string, check: typeof checkDefinitions[number]): boolean =>
  check.mentions.test(source) && (!("tests" in check) || check.tests.test(source));

const clauses = (source: string): readonly string[] => source.split(/(?:[.!?]\s+|[\r\n;]+)/).map((clause) => clause.trim()).filter(Boolean);

const commandKey = (command: PlannedIntegrationCommand): string =>
  JSON.stringify([command.check, command.repository_id, command.executable, command.argv]);

export const plannedIntegrationCommands = (task: TaskGraphTask, planSource: string): readonly PlannedIntegrationCommand[] => {
  const planLines = planSource.split(/\r?\n/);
  const commands = task.verification.flatMap((verification) => {
    const verificationClauses = clauses(verification.method);
    return checkDefinitions.flatMap((check) => commandsIn(verification.method).flatMap((command) => {
      const exact = `\`${command.repository_id}: ${[command.executable, ...command.argv].join(" ")}\``;
      const methodMatches = verificationClauses.some((clause) => clause.includes(exact) &&
        mentionsCheck(`${verification.scope}\n${clause}`, check));
      const planMatches = planLines.some((line) => clauses(line).some((clause) => clause.includes(exact) && mentionsCheck(clause, check)));
      return methodMatches && planMatches ? [{ ...command, check: check.check }] : [];
    }));
  });
  const unique = new Map(commands.map((command) => [commandKey(command), command]));
  return [...unique.values()];
};

export const isPlannedIntegrationCommand = (
  task: TaskGraphTask,
  planSource: string,
  check: PlannedIntegrationCommand["check"],
  command: Omit<PlannedIntegrationCommand, "check">,
): boolean => plannedIntegrationCommands(task, planSource).some((planned) =>
  planned.check === check && planned.repository_id === command.repository_id && planned.executable === command.executable &&
  JSON.stringify(planned.argv) === JSON.stringify(command.argv));
