/**
 * Unit Tests for ClickHouse Filter Classes
 * These tests validate the SQL generation logic for nested metadata filtering
 */

// Since these are pure unit tests testing SQL generation logic,
// we don't need the full environment setup, just the class definitions
import { StringObjectFilter, NumberObjectFilter } from "@langfuse/shared/src/server/queries/clickhouse-sql/clickhouse-filter";

describe("ClickHouse Filter Tests", () => {
  describe("StringObjectFilter", () => {
    describe("single-level key filtering", () => {
      it("should generate correct SQL for single-level key with equals operator", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "=",
          key: "environment",
          value: "production",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/metadata\[{stringObjectKeyFilter\w+: String}\] = {stringObjectValueFilter\w+: String}/);
        expect(Object.keys(result.params)).toHaveLength(2);
        expect(Object.values(result.params)).toContain("environment");
        expect(Object.values(result.params)).toContain("production");
      });

      it("should generate correct SQL for single-level key with contains operator", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "contains",
          key: "user_id",
          value: "test",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/position\(metadata\[{stringObjectKeyFilter\w+: String}\], {stringObjectValueFilter\w+: String}\) > 0/);
        expect(Object.values(result.params)).toContain("user_id");
        expect(Object.values(result.params)).toContain("test");
      });

      it("should generate correct SQL for single-level key with starts with operator", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "starts with",
          key: "name",
          value: "prefix",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/startsWith\(metadata\[{stringObjectKeyFilter\w+: String}\], {stringObjectValueFilter\w+: String}\)/);
        expect(Object.values(result.params)).toContain("name");
        expect(Object.values(result.params)).toContain("prefix");
      });
    });

    describe("nested key filtering", () => {
      it("should generate correct SQL for nested key with equals operator", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "=",
          key: "user_api_key_metadata.user_id",
          value: "user123",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/JSONExtractString\(metadata, '\$\.user_api_key_metadata\.user_id'\) = {stringObjectValueFilter\w+: String}/);
        expect(Object.keys(result.params)).toHaveLength(1);
        expect(Object.values(result.params)).toContain("user123");
      });

      it("should generate correct SQL for deeply nested key with contains operator", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "contains",
          key: "config.model.parameters.temperature",
          value: "0.5",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/position\(JSONExtractString\(metadata, '\$\.config\.model\.parameters\.temperature'\), {stringObjectValueFilter\w+: String}\) > 0/);
        expect(Object.keys(result.params)).toHaveLength(1);
        expect(Object.values(result.params)).toContain("0.5");
      });

      it("should generate correct SQL for nested key with does not contain operator", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "does not contain",
          key: "user.profile.type",
          value: "admin",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/position\(JSONExtractString\(metadata, '\$\.user\.profile\.type'\), {stringObjectValueFilter\w+: String}\) = 0/);
        expect(Object.values(result.params)).toContain("admin");
      });

      it("should generate correct SQL for nested key with ends with operator", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "ends with",
          key: "file.name.extension",
          value: ".json",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/endsWith\(JSONExtractString\(metadata, '\$\.file\.name\.extension'\), {stringObjectValueFilter\w+: String}\)/);
        expect(Object.values(result.params)).toContain(".json");
      });
    });

    describe("with table prefix", () => {
      it("should handle table prefix correctly for single-level key", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "=",
          key: "environment",
          value: "production",
          tablePrefix: "obs",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/obs\.metadata\[{stringObjectKeyFilter\w+: String}\] = {stringObjectValueFilter\w+: String}/);
      });

      it("should handle table prefix correctly for nested key", () => {
        const filter = new StringObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "=",
          key: "user.id",
          value: "123",
          tablePrefix: "obs",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/JSONExtractString\(obs\.metadata, '\$\.user\.id'\) = {stringObjectValueFilter\w+: String}/);
      });
    });
  });

  describe("NumberObjectFilter", () => {
    describe("single-level key filtering", () => {
      it("should generate correct SQL for single-level key with equals operator", () => {
        const filter = new NumberObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "=",
          key: "score",
          value: 0.95,
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/empty\(arrayFilter\(x -> \(\(\(x\.1\) = {numberObjectKeyFilter\w+: String}\) AND \(\(x\.2\) = {numberObjectValueFilter\w+: Decimal64\(12\)}\)\), metadata\)\) = 0/);
        expect(Object.keys(result.params)).toHaveLength(2);
        expect(Object.values(result.params)).toContain("score");
        expect(Object.values(result.params)).toContain(0.95);
      });

      it("should generate correct SQL for single-level key with greater than operator", () => {
        const filter = new NumberObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: ">",
          key: "confidence",
          value: 0.8,
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/empty\(arrayFilter\(x -> \(\(\(x\.1\) = {numberObjectKeyFilter\w+: String}\) AND \(\(x\.2\) > {numberObjectValueFilter\w+: Decimal64\(12\)}\)\), metadata\)\) = 0/);
        expect(Object.values(result.params)).toContain("confidence");
        expect(Object.values(result.params)).toContain(0.8);
      });
    });

    describe("nested key filtering", () => {
      it("should generate correct SQL for nested key with equals operator", () => {
        const filter = new NumberObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "=",
          key: "model.temperature",
          value: 0.7,
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/JSONExtractFloat\(metadata, '\$\.model\.temperature'\) = {numberObjectValueFilter\w+: Decimal64\(12\)}/);
        expect(Object.keys(result.params)).toHaveLength(1);
        expect(Object.values(result.params)).toContain(0.7);
      });

      it("should generate correct SQL for deeply nested key with less than operator", () => {
        const filter = new NumberObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "<",
          key: "config.model.parameters.max_tokens",
          value: 1000,
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/JSONExtractFloat\(metadata, '\$\.config\.model\.parameters\.max_tokens'\) < {numberObjectValueFilter\w+: Decimal64\(12\)}/);
        expect(Object.keys(result.params)).toHaveLength(1);
        expect(Object.values(result.params)).toContain(1000);
      });

      it("should generate correct SQL for nested key with not equals operator", () => {
        const filter = new NumberObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "!=",
          key: "user.api_key.rate_limit",
          value: 100,
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/JSONExtractFloat\(metadata, '\$\.user\.api_key\.rate_limit'\) != {numberObjectValueFilter\w+: Decimal64\(12\)}/);
        expect(Object.values(result.params)).toContain(100);
      });
    });

    describe("with table prefix", () => {
      it("should handle table prefix correctly for single-level key", () => {
        const filter = new NumberObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: ">=",
          key: "version",
          value: 2,
          tablePrefix: "obs",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/empty\(arrayFilter\(x -> \(\(\(x\.1\) = {numberObjectKeyFilter\w+: String}\) AND \(\(x\.2\) >= {numberObjectValueFilter\w+: Decimal64\(12\)}\)\), obs\.metadata\)\) = 0/);
      });

      it("should handle table prefix correctly for nested key", () => {
        const filter = new NumberObjectFilter({
          clickhouseTable: "observations",
          field: "metadata",
          operator: "<=",
          key: "performance.latency",
          value: 500,
          tablePrefix: "obs",
        });

        const result = filter.apply();
        
        expect(result.query).toMatch(/JSONExtractFloat\(obs\.metadata, '\$\.performance\.latency'\) <= {numberObjectValueFilter\w+: Decimal64\(12\)}/);
      });
    });
  });

  describe("edge cases", () => {
    it("should handle keys with special characters in nested paths", () => {
      const filter = new StringObjectFilter({
        clickhouseTable: "observations",
        field: "metadata",
        operator: "=",
        key: "user-data.sub_field.special_key",
        value: "test",
      });

      const result = filter.apply();
      
      expect(result.query).toMatch(/JSONExtractString\(metadata, '\$\.user-data\.sub_field\.special_key'\)/);
    });

    it("should handle single character nested keys", () => {
      const filter = new NumberObjectFilter({
        clickhouseTable: "observations",
        field: "metadata",
        operator: "=",
        key: "a.b.c",
        value: 1,
      });

      const result = filter.apply();
      
      expect(result.query).toMatch(/JSONExtractFloat\(metadata, '\$\.a\.b\.c'\)/);
    });

    it("should distinguish between single dot in value vs key", () => {
      const singleKeyFilter = new StringObjectFilter({
        clickhouseTable: "observations",
        field: "metadata",
        operator: "=",
        key: "environment",
        value: "dev.staging",
      });

      const nestedKeyFilter = new StringObjectFilter({
        clickhouseTable: "observations",
        field: "metadata",
        operator: "=",
        key: "env.type",
        value: "staging",
      });

      const singleResult = singleKeyFilter.apply();
      const nestedResult = nestedKeyFilter.apply();
      
      // Single key should use map access
      expect(singleResult.query).toMatch(/metadata\[{stringObjectKeyFilter\w+: String}\]/);
      expect(Object.keys(singleResult.params)).toHaveLength(2);
      
      // Nested key should use JSONExtract
      expect(nestedResult.query).toMatch(/JSONExtractString\(metadata, '\$\.env\.type'\)/);
      expect(Object.keys(nestedResult.params)).toHaveLength(1);
    });
  });
});
