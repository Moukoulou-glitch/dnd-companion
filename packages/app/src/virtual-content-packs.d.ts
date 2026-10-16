declare module "virtual:content-packs" {
  import type { ContentPack } from "@dnd/schema";
  /** The SRD pack, then the table's pack, already checked against the schema at build time. */
  const packs: ContentPack[];
  export default packs;
}
