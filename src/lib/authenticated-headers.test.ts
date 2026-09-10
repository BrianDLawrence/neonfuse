import { describe, expect, it } from "vitest";
import { authenticatedHeaders } from "./authenticated-headers";

describe("authenticatedHeaders", () => {
  it("adds an Activity bearer token without dropping existing headers", () => {
    const headers = authenticatedHeaders("activity-token", {
      "Content-Type": "application/json"
    });

    expect(headers.get("authorization")).toBe("Bearer activity-token");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("leaves browser cookie requests without an authorization header", () => {
    const headers = authenticatedHeaders(undefined, {
      Accept: "application/json"
    });

    expect(headers.has("authorization")).toBe(false);
    expect(headers.get("accept")).toBe("application/json");
  });
});
