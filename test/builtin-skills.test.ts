import { BUILTIN_SKILLS } from "../app/skills";

describe("builtin skills bootstrap", () => {
  test("includes default direct chat skill without waiting for async fetch", () => {
    expect(
      BUILTIN_SKILLS.some(
        (skill) => skill.lang === "cn" && skill.name === "通用问答",
      ),
    ).toBe(true);
    expect(
      BUILTIN_SKILLS.some(
        (skill) => skill.lang === "en" && skill.name === "Direct Chat",
      ),
    ).toBe(true);
  });
});
