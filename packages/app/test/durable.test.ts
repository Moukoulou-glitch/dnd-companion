import { describe, expect, it } from "vitest";
import { durableReduce } from "../src/components/Durable";

describe("Durable's Hit Die shown", () => {
  it("the die plus Constitution, with the working", () => {
    expect(durableReduce(6, 3)).toEqual({ reduce: 9, text: "6 + 3 Constitution = 9" });
  });
  it("at least 3, and it says so", () => {
    expect(durableReduce(1, 0)).toEqual({ reduce: 3, text: "1 + 0 Constitution = 1, minimum 3" });
    expect(durableReduce(2, -1)).toEqual({ reduce: 3, text: "2 − 1 Constitution = 1, minimum 3" });
  });
});
