import { after, before, describe, it } from "node:test";
import { createSuiteContext, destroySuiteContext, withFreshScenario } from "./support.mjs";
import { scenarios } from "./scenarios.mjs";

describe("guard e2e", () => {
  let suiteContext;

  before(async () => {
    suiteContext = await createSuiteContext();
  });

  after(async () => {
    await destroySuiteContext(suiteContext);
  });

  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      await withFreshScenario(suiteContext, async (context) => {
        await scenario.run(context, () => {});
      });
    }, 30000);
  }
});
