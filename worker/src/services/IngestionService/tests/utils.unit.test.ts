import { overwriteObject } from "../utils";
import { expect, describe, it } from "vitest";

describe("overwriteObject", () => {
  const objA = {
    id: "1",
    project_id: "101",
    name: "Object A",
    value: 10,
    metadata: { key1: "value1", key2: "value2" },
    tags: ["tag4", "tag2"],
  };

  const objB = {
    id: "1",
    project_id: "101",
    name: "Object B",
    value: 20,
    metadata: { key2: "newValue2", key3: "value3" },
    tags: ["tag1", "tag2", "tag3"],
  };

  it("should overwrite properties of object A with object B", () => {
    const result = overwriteObject(objA, objB, []);
    expect(result.name).toBe("Object B");
    expect(result.value).toBe(20);
  });

  it("should not overwrite non-overwritable keys", () => {
    const result = overwriteObject(objA, objB, ["name"]);
    expect(result.name).toBe("Object A");
    expect(result.value).toBe(20);
  });

  it("should merge metadata correctly", () => {
    const result = overwriteObject(objA, objB, []);
    expect(result.metadata).toEqual({
      key1: "value1",
      key2: "newValue2",
      key3: "value3",
    });
  });

  it("should merge tags correctly", () => {
    const result = overwriteObject(objA, objB, []);
    expect(result.tags).toEqual(["tag1", "tag2", "tag3", "tag4"]);
  });

  it("should handle cases where metadata is missing in one object", () => {
    const objC = { ...objA, metadata: undefined };
    const result = overwriteObject(objC, objB, []);
    expect(result.metadata).toEqual({
      key2: "newValue2",
      key3: "value3",
    });
  });

  it("should handle cases where metadata is missing in both objects", () => {
    const objC = { ...objA, metadata: undefined };
    const objD = { ...objB, metadata: undefined };
    const result = overwriteObject(objC, objD, []);
    expect(result.metadata).toEqual({});
  });

  it("should overwrite null keys", () => {
    const obj_1 = { key1: null, key2: "value2" };
    const obj_2 = { key1: "newValue1", key2: "newValue2 " };

    const result = overwriteObject(obj_1 as any, obj_2 as any, []);

    expect(result.key1).toBe("newValue1");
  });
});
