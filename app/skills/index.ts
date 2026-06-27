import { Skill } from "../store/skill";
import { CN_SKILLS } from "./cn";
import { EN_SKILLS } from "./en";

import { type BuiltinSkill } from "./typing";
export { type BuiltinSkill } from "./typing";
export {
  type LocalizedText,
  type SkillIcon,
  type SkillInstructions,
  type SkillLaunch,
  type SkillToolServer,
  type SkillPackage,
  type SkillPackageModel,
  type SkillPermissions,
  type SkillRelease,
  type SkillTool,
  type SkillVisibility,
  resolveLocalizedText,
  skillPackageToSkill,
  skillToSkillPackage,
} from "./package";

export const BUILTIN_SKILL_ID = 100000;

export const BUILTIN_SKILL_STORE = {
  buildinId: BUILTIN_SKILL_ID,
  skills: {} as Record<string, BuiltinSkill>,
  get(id?: string) {
    if (!id) return undefined;
    return this.skills[id] as Skill | undefined;
  },
  add(skill: BuiltinSkill) {
    const savedSkill = { ...skill, id: this.buildinId++, builtin: true };
    this.skills[savedSkill.id] = savedSkill;
    return savedSkill;
  },
};

export const BUILTIN_SKILLS: BuiltinSkill[] = [];

function getBuiltinSkillKey(
  skill: Pick<BuiltinSkill, "lang" | "name" | "createdAt">,
) {
  return `${skill.lang}:${skill.name}:${skill.createdAt}`;
}

function registerBuiltinSkills(skills: BuiltinSkill[]) {
  const existing = new Set(BUILTIN_SKILLS.map(getBuiltinSkillKey));
  skills.forEach((skill) => {
    const key = getBuiltinSkillKey(skill);
    if (existing.has(key)) return;
    existing.add(key);
    BUILTIN_SKILLS.push(BUILTIN_SKILL_STORE.add(skill));
  });
}

registerBuiltinSkills([...CN_SKILLS, ...EN_SKILLS]);

if (typeof window != "undefined") {
  // run in browser skip in next server
  fetch("/skills.json")
    .then((res) => res.json())
    .catch((error) => {
      console.error("[Fetch] failed to fetch skills", error);
      return { cn: [], en: [] };
    })
    .then((skills) => {
      const { cn = [], en = [] } = skills;
      registerBuiltinSkills([...cn, ...en]);
    });
}
