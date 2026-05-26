import fs from "fs";
import path from "path";
import { CN_SKILLS } from "./cn";
import { EN_SKILLS } from "./en";

import { type BuiltinSkill } from "./typing";

const BUILTIN_SKILLS: Record<string, BuiltinSkill[]> = {
  cn: CN_SKILLS,
  en: EN_SKILLS,
};

const dirname = path.dirname(__filename);

fs.writeFile(
  dirname + "/../../public/skills.json",
  JSON.stringify(BUILTIN_SKILLS, null, 4),
  function (error) {
    if (error) {
      console.error("[Build] failed to build skills", error);
    }
  },
);
