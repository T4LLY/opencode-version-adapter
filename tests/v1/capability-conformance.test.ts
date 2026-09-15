import { assertRequiredCapabilitiesSupported } from "../../src/contract/capabilities.js";
import { OPEN_CODE_V1_CAPABILITY_SUPPORT } from "../../src/adapters/v1/index.js";
import { runCapabilityConformanceSuite } from "../contract/capability-conformance.js";

/**
 * Run the generation-independent capability-support contract against the real
 * OpenCode v1 baseline metadata. Detailed semantics remain covered by the
 * focused v1 tests for each capability mapping.
 */
runCapabilityConformanceSuite({
  support: OPEN_CODE_V1_CAPABILITY_SUPPORT,
  assertRequired(required) {
    assertRequiredCapabilitiesSupported(required, OPEN_CODE_V1_CAPABILITY_SUPPORT);
  },
});
