import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["src", "supabase/functions"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
    } else if (extensions.has(absolute.slice(absolute.lastIndexOf(".")))) {
      files.push(absolute);
    }
  }
}

for (const root of roots) {
  try {
    walk(join(process.cwd(), root));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const selectCall = /\.select\(\s*(["'`])([\s\S]*?)\1/g;
const embeddedRelation = /(?:^|,)\s*(?:[A-Za-z_][\w]*:)?([A-Za-z_][\w]*)(![A-Za-z_][\w]*)?\s*\(/g;
const problems = [];
let selectsChecked = 0;
let relationsChecked = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  let call;

  while ((call = selectCall.exec(source)) !== null) {
    selectsChecked += 1;
    const selection = call[2];
    let relation;

    while ((relation = embeddedRelation.exec(selection)) !== null) {
      relationsChecked += 1;
      if (!relation[2]) {
        const absoluteOffset = call.index + call[0].indexOf(selection) + relation.index;
        const line = source.slice(0, absoluteOffset).split("\n").length;
        problems.push(
          `${relative(process.cwd(), file)}:${line} — nested relation "${relation[1]}" must name its foreign key (use !constraint_name)`
        );
      }
    }

    embeddedRelation.lastIndex = 0;
  }
}

if (problems.length) {
  console.error("Supabase relationship check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nAdd the exact foreign-key constraint name to every embedded relationship.");
  process.exit(1);
}

console.log(
  `Supabase relationship check passed: ${selectsChecked} select calls and ${relationsChecked} embedded relationships checked.`
);
