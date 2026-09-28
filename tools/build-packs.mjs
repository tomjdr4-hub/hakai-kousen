/**
 * Compile les sources JSON de packs-src/<pack>/ en compendiums LevelDB dans packs/<pack>/.
 */
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { readdir, rm } from "node:fs/promises";

const packs = await readdir("packs-src", { withFileTypes: true });
for ( const pack of packs.filter(p => p.isDirectory()) ) {
  const dest = `packs/${pack.name}`;
  await rm(dest, { recursive: true, force: true });
  await compilePack(`packs-src/${pack.name}`, dest, { log: false });
  console.log(`Compilé : ${dest}`);
}
