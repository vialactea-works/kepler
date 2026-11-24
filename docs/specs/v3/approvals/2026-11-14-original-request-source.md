# Original-request source statement clarification

Status: Proposed. Not approved.

This clarifies only the retained requester-statement representation required by B3 of the exact approved proposal SHA-256 `23ad0a617bb9c4ca57c195e2a83243fc57396d03a93025f547848e845b5075b9`. It leaves that approved artifact unchanged.

## Exact rule

The B3 assertion's `decision_reference` MUST equal exactly one reference in its existing `source_material` list. That material MUST retain the requester's specific unchanged-original statement as the following canonical UTF-8 text, without a BOM and with exactly one LF after each line, including the last line:

```text
I confirm that this is the exact original request and that the actual work request is unchanged.
Requester: <canonical JSON string of assertion.requester>
Mission: <assertion.mission_binding.mission_id>
Reset: <assertion.reset_event_id>
Generation: <assertion.generation_id>
Original request: <canonical JSON string of assertion.original_request>
```

Angle-bracket expressions identify substitutions; they are not literal source bytes. Use Kepler's existing canonical JSON string serialization for the two string substitutions. This preserves exact decoded request content, including whitespace, newlines, and Unicode, without normalization. The UUID substitutions use the exact already-validated B3 values.

Kepler MUST read the referenced material through the existing supported material reader, verify its declared hash, and compare its complete bytes with this statement generated from the B3 values. Generic approval, restart approval, missing statement text, extra text, different scope/requester/request, changed hashes, BOM, or different line endings MUST NOT satisfy this source check. Other `source_material` entries can retain applicable original-request evidence under the existing rules.

The statement is retained source material, not a third JSON evidence-document schema. The B3 document keeps exactly its approved fields. An implementation can render a proposed statement for requester review; rendering it does not create requester consent. Neither this text, the B3 assertion, a name, nor a hash authenticates a person or proves historical truth. The existing responsibility for an actual requester decision remains in force.

## Approval limits

Exact approval would authorize this additional source-material encoding, its validator/renderer, related documentation, and proportionate tests. It would not supply a statement for any real mission or approve a live operation, original-mission change, release, version bump, installation, activation, merge, or deployment. All other SH127/SH128 requirements remain unchanged.
