import { describe, expect, it } from "vitest";

import {
  filterApiKeysByOwner,
  keepApiKeysOfUsers,
} from "./filterApiKeysByOwner";

// carol is a member without gateway keys; service-key belongs to no user.
const owners = new Map<string, string | null>([
  ["alice-key", "alice"],
  ["bob-key", "bob"],
  ["bob-key-2", "bob"],
  ["service-key", null],
]);
const apiKeyIds = ["alice-key", "bob-key", "bob-key-2", "service-key"];

describe("filterApiKeysByOwner", () => {
  it("keeps every key while no user is selected", () => {
    expect(
      filterApiKeysByOwner({
        apiKeyIds,
        owners,
        userIds: [],
        selectedApiKeyIds: [],
      }),
    ).toEqual(apiKeyIds);
  });

  it("keeps only the keys of the selected user", () => {
    expect(
      filterApiKeysByOwner({
        apiKeyIds,
        owners,
        userIds: ["alice"],
        selectedApiKeyIds: [],
      }),
    ).toEqual(["alice-key"]);
  });

  it("keeps the keys of every selected user, in key order", () => {
    expect(
      filterApiKeysByOwner({
        apiKeyIds,
        owners,
        userIds: ["bob", "alice"],
        selectedApiKeyIds: [],
      }),
    ).toEqual(["alice-key", "bob-key", "bob-key-2"]);
  });

  it("hides service-account keys even when every user is selected", () => {
    expect(
      filterApiKeysByOwner({
        apiKeyIds,
        owners,
        userIds: ["alice", "bob", "carol"],
        selectedApiKeyIds: [],
      }),
    ).toEqual(["alice-key", "bob-key", "bob-key-2"]);
  });

  it("offers no keys for a typed user that owns none", () => {
    expect(
      filterApiKeysByOwner({
        apiKeyIds,
        owners,
        userIds: ["unknown-user"],
        selectedApiKeyIds: [],
      }),
    ).toEqual([]);
  });

  it("keeps selected keys of other owners so they can still be cleared", () => {
    expect(
      filterApiKeysByOwner({
        apiKeyIds,
        owners,
        userIds: ["alice"],
        selectedApiKeyIds: ["service-key", "alice-key"],
      }),
    ).toEqual(["alice-key", "service-key"]);
  });
});

describe("keepApiKeysOfUsers", () => {
  it("drops selected keys that another user or no user owns", () => {
    expect(
      keepApiKeysOfUsers({
        selectedApiKeyIds: ["alice-key", "bob-key", "service-key"],
        owners,
        userIds: ["alice"],
      }),
    ).toEqual(["alice-key"]);
  });

  it("keeps the selected keys of every selected user", () => {
    expect(
      keepApiKeysOfUsers({
        selectedApiKeyIds: ["alice-key", "bob-key", "service-key"],
        owners,
        userIds: ["alice", "bob", "carol"],
      }),
    ).toEqual(["alice-key", "bob-key"]);
  });

  it("drops the keys of a user who is deselected", () => {
    expect(
      keepApiKeysOfUsers({
        selectedApiKeyIds: ["alice-key", "bob-key-2"],
        owners,
        userIds: ["alice"],
      }),
    ).toEqual(["alice-key"]);
  });

  it("drops every known key for a typed user that owns none", () => {
    expect(
      keepApiKeysOfUsers({
        selectedApiKeyIds: ["alice-key", "service-key"],
        owners,
        userIds: ["unknown-user"],
      }),
    ).toEqual([]);
  });

  it("keeps typed keys whose owner is unknown, such as deleted keys", () => {
    expect(
      keepApiKeysOfUsers({
        selectedApiKeyIds: ["deleted-key", "bob-key"],
        owners,
        userIds: ["alice"],
      }),
    ).toEqual(["deleted-key"]);
  });

  it("keeps every selected key while owners have not loaded", () => {
    expect(
      keepApiKeysOfUsers({
        selectedApiKeyIds: ["alice-key", "bob-key"],
        owners: new Map(),
        userIds: ["alice"],
      }),
    ).toEqual(["alice-key", "bob-key"]);
  });

  it("keeps every selected key once no user is selected", () => {
    expect(
      keepApiKeysOfUsers({
        selectedApiKeyIds: ["bob-key", "service-key"],
        owners,
        userIds: [],
      }),
    ).toEqual(["bob-key", "service-key"]);
  });
});
