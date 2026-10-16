export const attemptStartHasKnownParentage = (startHead: string, admissionCommit: string, parents: readonly string[], previousTerminal: string | undefined): boolean => {
  if (startHead === admissionCommit) return true;
  if (parents.length !== 2 || !parents.includes(admissionCommit) || previousTerminal === undefined) return false;
  const otherParent = parents.find((parent) => parent !== admissionCommit);
  return otherParent === previousTerminal;
};
