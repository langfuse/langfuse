type JSONValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JSONObject
  | JSONArray;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];

export function alignJSONStructures(
  json1: JSONValue,
  json2: JSONValue,
): [JSONValue, JSONValue] {
  if (
    json1 === null ||
    json1 === undefined ||
    json2 === null ||
    json2 === undefined
  ) {
    return [json1, json2];
  }

  if (Array.isArray(json1) && Array.isArray(json2)) {
    return alignArrays(json1, json2);
  } else if (isObject(json1) && isObject(json2)) {
    return alignObjects(json1, json2);
  }

  return [json1, json2]; // Base case for primitive values or mismatched types
}

function alignArrays(arr1: JSONArray, arr2: JSONArray): [JSONArray, JSONArray] {
  const matched1: JSONArray = [];
  const matched2: JSONArray = [];
  const unmatched1: JSONArray = [];
  const unmatched2: JSONArray = [];

  // Match items
  const usedIndices2 = new Set<number>();
  arr1.forEach((item1) => {
    const matchIndex = arr2.findIndex(
      (item2, index2) => !usedIndices2.has(index2) && item1 === item2,
    );
    if (matchIndex !== -1) {
      matched1.push(item1);
      matched2.push(arr2[matchIndex]);
      usedIndices2.add(matchIndex);
    } else {
      unmatched1.push(item1);
    }
  });

  // Collect unmatched items from the second array
  arr2.forEach((item2, index2) => {
    if (!usedIndices2.has(index2)) {
      unmatched2.push(item2);
    }
  });

  // Combine matched and unmatched elements, maintaining order
  return [
    [...matched1, ...unmatched1],
    [...matched2, ...unmatched2],
  ];
}

function alignObjects(
  obj1: JSONObject,
  obj2: JSONObject,
): [JSONObject, JSONObject] {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  const allKeys = Array.from(new Set([...keys1, ...keys2])); // Union of keys
  const result1: JSONObject = {};
  const result2: JSONObject = {};

  for (const key of allKeys) {
    const value1 = obj1[key];
    const value2 = obj2[key];

    const [alignedValue1, alignedValue2] = alignJSONStructures(value1, value2);
    result1[key] = alignedValue1;
    result2[key] = alignedValue2;
  }

  return [result1, result2];
}

function isObject(value: any): value is JSONObject {
  return value && typeof value === "object" && !Array.isArray(value);
}
