import { OPEN_CODE_V2_CAPABILITY_SUPPORT } from "../../src/adapters/v2";
import { assertRequiredCapabilitiesSupported } from "../../src/contract/capabilities";
import { runCapabilityConformanceSuite } from "../contract/capability-conformance";

/**
 * Run the generation-independent capability-support contract against the real
 * OpenCode v2.0.3 baseline metadata. Focused v2 tests cover the detailed native
 * mappings; this suite locks explicit unsupported behavior for the two missing
 * host surfaces as well as completeness of the support map.
 */
runCapabilityConformanceSuite({
  support: OPEN_CODE_V2_CAPABILITY_SUPPORT,
  assertRequired(required) {
    assertRequiredCapabilitiesSupported(required, OPEN_CODE_V2_CAPABILITY_SUPPORT);
  },
});
