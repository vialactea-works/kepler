import type { TaskGraph } from "../../packages/cli/src/construction/task-graph.js";

export const taskGraphExample = (
  reference = ".kepler/missions/<mission-id>/construction/units-of-work/2026-10-18-message-publishing/design.md#boundaries-and-interactions",
): TaskGraph => ({
  format: "kepler-task-dag",
  version: 1,
  id: "7e9e09ec-0b0e-4b27-9cc7-373ad7bc869c",
  unit_id: "2026-10-18-message-publishing",
  tasks: [
    {
      id: "2a0a7e72-d468-43ed-bc89-54a2139c56ab",
      title: "Define publishing boundary",
      goal: "Define an adapter-independent publishing contract and a test double.",
      inputs: [
        {
          reference,
          purpose: "Implement the accepted publishing contract.",
        },
      ],
      outputs: ["Publishing boundary contract", "Publishing test double"],
      acceptance_criteria: [
        "The boundary expresses the required inputs, outcomes, and failure behavior without a broker-specific client interface.",
      ],
      guidance: ["Follow the existing application boundary conventions."],
      verification: [
        {
          scope: "Publishing boundary behavior",
          method: "Run the boundary's unit tests.",
          expected_result: "Normal and failure outcomes satisfy the declared contract.",
        },
      ],
      depends_on: [],
      prerequisites: [],
    },
    {
      id: "6fa217c8-5078-4b15-81da-a9e979d74e64",
      title: "Implement publishing adapter",
      goal: "Connect the publishing boundary to the selected broker without changing application rules.",
      inputs: [
        {
          reference: ".kepler/missions/<mission-id>/construction/units-of-work/2026-10-18-message-publishing/plan.md#technical-solution",
          purpose: "Use the selected broker and its documented error mapping.",
        },
      ],
      outputs: ["Broker publishing adapter", "Adapter integration tests"],
      acceptance_criteria: [
        "Messages reach the broker through the publishing boundary.",
        "Provider failures produce the declared application errors.",
      ],
      guidance: [
        "Keep the broker client inside the adapter.",
        "Keep broker resources isolated from concurrent tasks.",
      ],
      verification: [
        {
          scope: "Adapter and broker collaboration",
          method: "Run the adapter's integration tests against a disposable broker instance with test data isolated from concurrent tasks.",
          expected_result: "Publishing and provider-failure cases satisfy the boundary contract.",
        },
      ],
      depends_on: [
        {
          task_id: "2a0a7e72-d468-43ed-bc89-54a2139c56ab",
          reason: "The adapter implements the predecessor's publishing contract.",
        },
      ],
      prerequisites: [
        {
          description: "Isolated broker test environment",
          needed_for: "verification",
          needed_when: "Before adapter integration tests",
          blocking: true,
          condition: "The test environment supplies a reachable broker and disposable test credentials.",
          reason: "Adapter verification requires collaboration with a real broker.",
        },
      ],
    },
  ],
});
