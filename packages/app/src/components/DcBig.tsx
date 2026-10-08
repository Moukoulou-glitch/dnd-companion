import type { FeatureDc } from "@dnd/engine";
import { BreakdownLines } from "./Sheet";

/** A feature's save DC, big and bold, with how it adds up underneath. */
export function DcBig({ dc }: { dc: FeatureDc }) {
  return (
    <details className="dc-big">
      <summary>
        <span className="dc-num">DC {dc.value}</span>
        <span className="dc-save">{dc.save === "none" ? "" : `${dc.save} save`}</span>
        <small>{dc.name}</small>
      </summary>
      <BreakdownLines b={dc.breakdown} totalLabel="DC" />
    </details>
  );
}
