import { describe, expect, it } from "vitest";
import { profileRows, shortDay } from "./profile-rows";

// Spec 0012, AC-8.

const names = (id: string) => (id === "beacon" ? "Beacon" : null);

describe("profileRows", () => {
  it("lists valid facts in catalog order with their origin", () => {
    const rows = profileRows(
      [
        {
          key: "industry",
          value: "restaurants",
          sourceToolId: null,
          updatedAt: "2026-11-25T09:00:00Z",
        },
        {
          key: "business_name",
          value: "Ada Foods",
          sourceToolId: "beacon",
          updatedAt: "2026-11-24T10:00:00Z",
        },
      ],
      names,
      "Africa/Lagos",
    );
    expect(rows.map((r) => [r.key, r.value, r.origin])).toEqual([
      ["business_name", "Ada Foods", "From Beacon, 24 Nov"],
      ["industry", "Restaurants", "You edited this, 25 Nov"],
    ]);
    expect(rows[1]?.initialValue).toBe("restaurants");
  });

  it("leaves out facts that no longer fit, and unknown keys", () => {
    expect(
      profileRows(
        [
          {
            key: "industry",
            value: "space",
            sourceToolId: null,
            updatedAt: "x",
          },
          { key: "mood", value: "happy", sourceToolId: null, updatedAt: "x" },
        ],
        names,
        "Africa/Lagos",
      ),
    ).toEqual([]);
  });

  it("opens a range no edit bucket holds with no answer picked", () => {
    const [row] = profileRows(
      [
        {
          key: "years_in_business",
          value: { min: 1, max: 3 },
          sourceToolId: "beacon",
          updatedAt: "2026-11-24T10:00:00Z",
        },
      ],
      names,
      "Africa/Lagos",
    );
    expect(row).toMatchObject({ value: "1 to 3 years", initialValue: null });
  });

  it("formats a day in Lagos time", () => {
    expect(shortDay("2026-11-24T23:30:00Z", "Africa/Lagos")).toBe("25 Nov");
    expect(shortDay("nope", "Africa/Lagos")).toBeNull();
  });
});
