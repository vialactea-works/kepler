import { describe, expect, it } from "vitest";
import { validateStageStartRequest } from "../../packages/cli/src/construction/stage-start.js";

const validRequest = () => ({
  inputs: [{ reference: "mission:request", purpose: "Requester intent for this stage" }],
});

describe("Construction stage start request", () => {
  it("accepts selected inputs", () => {
    expect(validateStageStartRequest(validRequest())).toEqual({
      kind: "valid",
      request: validRequest(),
    });
  });

  it("rejects absent inputs and caller-supplied checkpoint or authority fields", () => {
    expect(validateStageStartRequest({})).toMatchObject({ kind: "invalid" });
    expect(validateStageStartRequest({ ...validRequest(), checkpoints: [] })).toMatchObject({ kind: "invalid" });
    expect(validateStageStartRequest({ ...validRequest(), authority_event_ids: [] })).toMatchObject({ kind: "invalid" });
  });

  it("rejects empty or malformed input references", () => {
    expect(validateStageStartRequest({ ...validRequest(), inputs: [] })).toMatchObject({ kind: "invalid" });
    expect(validateStageStartRequest({ ...validRequest(), inputs: [{ reference: "", purpose: "Context" }] }))
      .toMatchObject({ kind: "invalid" });
  });

});
