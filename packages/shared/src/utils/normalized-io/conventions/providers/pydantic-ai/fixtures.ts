import type { NormalizedIOFixture } from "../fixture-types";

export const pydanticAiProductionShapeFixture = {
  name: "normalizes an anonymized Pydantic AI span",
  otel: {
    scopeSpan: {
      scope: {
        name: "pydantic-ai",
        version: "2.29.0",
      },
      spans: [
        {
          traceId: Buffer.from("00000000000000000000000000000001", "hex"),
          spanId: Buffer.from("0000000000000001", "hex"),
          parentSpanId: Buffer.from("0000000000000002", "hex"),
          name: "synthetic_name_001",
          kind: 3,
          attributes: [
            {
              key: "gen_ai.operation.name",
              value: {
                stringValue: "chat",
              },
            },
            {
              key: "gen_ai.provider.name",
              value: {
                stringValue: "openai",
              },
            },
            {
              key: "gen_ai.system",
              value: {
                stringValue: "synthetic-value-015",
              },
            },
            {
              key: "synthetic.metadata.006",
              value: {
                stringValue: "synthetic-value-016",
              },
            },
            {
              key: "gen_ai.request.model",
              value: {
                stringValue: "gpt-5.4-mini-2026-03-17",
              },
            },
            {
              key: "gen_ai.agent.name",
              value: {
                stringValue: "synthetic-value-017",
              },
            },
            {
              key: "gen_ai.agent.call.id",
              value: {
                stringValue: "synthetic-value-018",
              },
            },
            {
              key: "gen_ai.conversation.id",
              value: {
                stringValue: "synthetic-value-019",
              },
            },
            {
              key: "synthetic.metadata.007",
              value: {
                stringValue:
                  '{"synthetic_field_006":[{"name":"synthetic_name_002","parameters_json_schema":{"additionalProperties":false,"properties":{"url":{"type":"string"}},"required":["synthetic_field_007"],"type":"object"},"description":"Synthetic description 020.","synthetic_field_008":null,"synthetic_field_009":true,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_003","parameters_json_schema":{"additionalProperties":false,"properties":{},"type":"object"},"description":"Synthetic description 021.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_004","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 022.","format":"synthetic-value-023","type":"string"}},"required":["synthetic_field_022"],"type":"object"},"description":"Synthetic description 024.","synthetic_field_008":null,"synthetic_field_009":true,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_005","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_023":"synthetic-value-025","synthetic_field_024":"synthetic-value-026","synthetic_field_025":"synthetic-value-027","synthetic_field_026":"synthetic-value-028","synthetic_field_027":"synthetic-value-029","synthetic_field_028":"synthetic-value-030","synthetic_field_029":"synthetic-value-031","synthetic_field_030":"synthetic-value-032","synthetic_field_031":85000,"synthetic_field_032":65000,"synthetic_field_033":"synthetic-value-033","synthetic_field_034":"synthetic-value-034"}],"properties":{"synthetic_field_034":{"description":"Synthetic description 035.","synthetic_field_021":["synthetic-value-036"],"synthetic_field_035":255,"synthetic_field_036":1,"type":"string"},"synthetic_field_029":{"synthetic_field_037":null,"description":"Synthetic description 037.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_026":{"synthetic_field_037":null,"description":"Synthetic description 038.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_027":{"synthetic_field_037":null,"description":"Synthetic description 039.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_023":{"synthetic_field_037":null,"description":"Synthetic description 040.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_024":{"synthetic_field_037":null,"description":"Synthetic description 041.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_025":{"synthetic_field_037":null,"description":"Synthetic description 042.","synthetic_field_021":["synthetic-value-043"],"anyOf":[{"synthetic_field_038":"synthetic-value-044"},{"type":"null"}]},"synthetic_field_028":{"synthetic_field_037":null,"description":"Synthetic description 045.","synthetic_field_021":["synthetic-value-046"],"anyOf":[{"synthetic_field_038":"synthetic-value-047"},{"type":"null"}]},"synthetic_field_033":{"synthetic_field_037":null,"description":"Synthetic description 048.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_039":{"synthetic_field_037":null,"description":"Synthetic description 049.","anyOf":[{"items":{"synthetic_field_038":"synthetic-value-050"},"type":"synthetic-value-051"},{"type":"null"}]},"synthetic_field_030":{"synthetic_field_037":null,"description":"Synthetic description 052.","synthetic_field_021":["synthetic-value-053"],"anyOf":[{"synthetic_field_038":"synthetic-value-054"},{"type":"null"}]},"synthetic_field_032":{"synthetic_field_037":null,"description":"Synthetic description 055.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_031":{"synthetic_field_037":null,"description":"Synthetic description 056.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_040":{"synthetic_field_037":null,"description":"Synthetic description 057.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_041":{"synthetic_field_037":null,"description":"Synthetic description 058.","anyOf":[{"type":"integer"},{"type":"null"}]}},"required":["synthetic_field_034"],"type":"object","synthetic_field_042":{"synthetic_field_043":{"enum":["synthetic-value-059","synthetic-value-060","synthetic-value-061","synthetic-value-062","synthetic-value-063","synthetic-value-064","synthetic-value-065","synthetic-value-066","synthetic-value-067","synthetic-value-068"],"type":"string"},"synthetic_field_044":{"enum":["synthetic-value-069","synthetic-value-070","synthetic-value-071"],"type":"string"},"synthetic_field_045":{"enum":["synthetic-value-072","synthetic-value-073","synthetic-value-074"],"type":"string"},"synthetic_field_046":{"properties":{"synthetic_field_047":{"description":"Synthetic description 075.","type":"string"},"synthetic_field_048":{"synthetic_field_037":null,"description":"Synthetic description 076.","synthetic_field_021":["synthetic-value-077"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_049":{"synthetic_field_037":null,"description":"Synthetic description 078.","synthetic_field_021":["synthetic-value-079"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_050":{"synthetic_field_037":null,"description":"Synthetic description 080.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_051":{"synthetic_field_037":null,"description":"Synthetic description 081.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_052":{"synthetic_field_037":null,"description":"Synthetic description 082.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_053":{"synthetic_field_037":null,"description":"Synthetic description 083.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_054":{"description":"Synthetic description 084.","synthetic_field_021":["synthetic-value-085"],"type":"string"},"synthetic_field_055":{"synthetic_field_037":null,"description":"Synthetic description 086.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_056":{"description":"Synthetic description 087.","type":"string"},"synthetic_field_057":{"synthetic_field_037":null,"description":"Synthetic description 088.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_058":{"synthetic_field_037":null,"description":"Synthetic description 089.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_059":{"synthetic_field_037":null,"description":"Synthetic description 090.","anyOf":[{"type":"string"},{"type":"null"}]}},"required":["synthetic_field_047","synthetic_field_054","synthetic_field_056"],"type":"object","additionalProperties":false}}},"description":"Synthetic description 091.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_006","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","synthetic_field_028":"synthetic-value-092","synthetic_field_031":90000,"synthetic_field_032":70000,"synthetic_field_033":"synthetic-value-093"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 094.","format":"synthetic-value-095","type":"string"},"synthetic_field_034":{"synthetic_field_037":null,"description":"Synthetic description 096.","synthetic_field_021":["synthetic-value-097"],"anyOf":[{"synthetic_field_035":255,"synthetic_field_036":1,"type":"string"},{"type":"null"}]},"synthetic_field_029":{"synthetic_field_037":null,"description":"Synthetic description 098.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_026":{"synthetic_field_037":null,"description":"Synthetic description 099.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_027":{"synthetic_field_037":null,"description":"Synthetic description 100.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_023":{"synthetic_field_037":null,"description":"Synthetic description 101.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_024":{"synthetic_field_037":null,"description":"Synthetic description 102.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_025":{"synthetic_field_037":null,"description":"Synthetic description 103.","synthetic_field_021":["synthetic-value-104"],"anyOf":[{"synthetic_field_038":"synthetic-value-105"},{"type":"null"}]},"synthetic_field_028":{"synthetic_field_037":null,"description":"Synthetic description 106.","synthetic_field_021":["synthetic-value-107"],"anyOf":[{"synthetic_field_038":"synthetic-value-108"},{"type":"null"}]},"synthetic_field_033":{"synthetic_field_037":null,"description":"Synthetic description 109.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_039":{"synthetic_field_037":null,"description":"Synthetic description 110.","anyOf":[{"items":{"synthetic_field_038":"synthetic-value-111"},"type":"synthetic-value-112"},{"type":"null"}]},"synthetic_field_030":{"synthetic_field_037":null,"description":"Synthetic description 113.","synthetic_field_021":["synthetic-value-114"],"anyOf":[{"synthetic_field_038":"synthetic-value-115"},{"type":"null"}]},"synthetic_field_032":{"synthetic_field_037":null,"description":"Synthetic description 116.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_031":{"synthetic_field_037":null,"description":"Synthetic description 117.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_040":{"synthetic_field_037":null,"description":"Synthetic description 118.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_041":{"synthetic_field_037":null,"description":"Synthetic description 119.","anyOf":[{"type":"integer"},{"type":"null"}]}},"required":["synthetic_field_022"],"type":"object","synthetic_field_042":{"synthetic_field_043":{"enum":["synthetic-value-120","synthetic-value-121","synthetic-value-122","synthetic-value-123","synthetic-value-124","synthetic-value-125","synthetic-value-126","synthetic-value-127","synthetic-value-128","synthetic-value-129"],"type":"string"},"synthetic_field_044":{"enum":["synthetic-value-130","synthetic-value-131","synthetic-value-132"],"type":"string"},"synthetic_field_045":{"enum":["synthetic-value-133","synthetic-value-134","synthetic-value-135"],"type":"string"},"synthetic_field_046":{"properties":{"synthetic_field_047":{"description":"Synthetic description 136.","type":"string"},"synthetic_field_048":{"synthetic_field_037":null,"description":"Synthetic description 137.","synthetic_field_021":["synthetic-value-138"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_049":{"synthetic_field_037":null,"description":"Synthetic description 139.","synthetic_field_021":["synthetic-value-140"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_050":{"synthetic_field_037":null,"description":"Synthetic description 141.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_051":{"synthetic_field_037":null,"description":"Synthetic description 142.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_052":{"synthetic_field_037":null,"description":"Synthetic description 143.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_053":{"synthetic_field_037":null,"description":"Synthetic description 144.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_054":{"description":"Synthetic description 145.","synthetic_field_021":["synthetic-value-146"],"type":"string"},"synthetic_field_055":{"synthetic_field_037":null,"description":"Synthetic description 147.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_056":{"description":"Synthetic description 148.","type":"string"},"synthetic_field_057":{"synthetic_field_037":null,"description":"Synthetic description 149.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_058":{"synthetic_field_037":null,"description":"Synthetic description 150.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_059":{"synthetic_field_037":null,"description":"Synthetic description 151.","anyOf":[{"type":"string"},{"type":"null"}]}},"required":["synthetic_field_047","synthetic_field_054","synthetic_field_056"],"type":"object","additionalProperties":false}}},"description":"Synthetic description 152.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_007","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_060":"synthetic-input-153"},{"synthetic_field_060":"synthetic-input-154"}],"properties":{"synthetic_field_060":{"description":"Synthetic description 155.","synthetic_field_021":["synthetic-value-156","synthetic-value-157"],"synthetic_field_036":1,"type":"string"}},"required":["synthetic_field_060"],"type":"object"},"description":"Synthetic description 158.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_008","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","status":"synthetic-value-159"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 160.","format":"synthetic-value-161","type":"string"},"status":{"description":"Synthetic description 162.","synthetic_field_021":["synthetic-value-163"],"anyOf":[{"synthetic_field_038":"synthetic-value-164"}]}},"required":["synthetic_field_022","synthetic_field_061"],"type":"object","synthetic_field_042":{"synthetic_field_062":{"enum":["synthetic-value-165","synthetic-value-166","synthetic-value-167"],"type":"string"}}},"description":"Synthetic description 168.","synthetic_field_008":null,"synthetic_field_009":true,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_009","parameters_json_schema":{"additionalProperties":false,"properties":{},"type":"object"},"description":"Synthetic description 169.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_010","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_063":[{"description":"Synthetic description 170.","synthetic_field_034":"synthetic-value-171"},{"description":"Synthetic description 172.","synthetic_field_034":"synthetic-value-173"}],"synthetic_field_022":"synthetic_id_002"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 174.","format":"synthetic-value-175","type":"string"},"synthetic_field_063":{"description":"Synthetic description 176.","items":{"synthetic_field_038":"synthetic-value-177"},"synthetic_field_064":5,"type":"synthetic-value-178"}},"required":["synthetic_field_022","synthetic_field_063"],"type":"object","synthetic_field_042":{"synthetic_field_065":{"additionalProperties":false,"properties":{"synthetic_field_034":{"description":"Synthetic description 179.","synthetic_field_035":255,"type":"string"},"description":{"description":"Synthetic description 180.","type":"string"}},"required":["synthetic_field_034","synthetic_field_066"],"type":"object"}}},"description":"Synthetic description 181.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_011","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","synthetic_field_067":[{"synthetic_field_068":"synthetic-value-182","required":true,"type":"boolean"},{"synthetic_field_068":"synthetic-value-183","required":false,"type":"text"}]}],"properties":{"synthetic_field_022":{"description":"Synthetic description 184.","format":"synthetic-value-185","type":"string"},"synthetic_field_067":{"description":"Synthetic description 186.","items":{"synthetic_field_038":"synthetic-value-187"},"type":"synthetic-value-188"}},"required":["synthetic_field_022","synthetic_field_067"],"type":"object","synthetic_field_042":{"synthetic_field_069":{"additionalProperties":false,"properties":{"synthetic_field_068":{"description":"Synthetic description 189.","synthetic_field_036":1,"type":"string"},"type":{"description":"Synthetic description 190.","enum":["text","boolean","synthetic-value-191"],"type":"string"},"required":{"description":"Synthetic description 192.","type":"boolean"}},"required":["synthetic_field_068","synthetic_field_070","synthetic_field_071"],"type":"object"}}},"description":"Synthetic description 193.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_012","parameters_json_schema":{"additionalProperties":false,"properties":{"synthetic_field_072":{"description":"Synthetic description 194.","synthetic_field_036":1,"type":"string"}},"required":["synthetic_field_072"],"type":"object"},"description":"Synthetic description 195.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null}],"synthetic_field_073":[],"synthetic_field_074":{"synthetic_field_075":"synthetic-value-196","synthetic_field_076":"synthetic-value-197","synthetic_field_077":"synthetic-value-198","synthetic_field_078":"synthetic-value-199","synthetic_field_079":"synthetic-value-200","synthetic_field_080":"synthetic-value-201","synthetic_field_081":"synthetic-value-202","synthetic_field_082":"synthetic-value-203","synthetic_field_083":"synthetic-value-204","synthetic_field_084":"synthetic-value-205","synthetic_field_085":"synthetic-value-206"},"synthetic_field_086":[],"synthetic_field_087":"synthetic-output-207","synthetic_field_088":null,"synthetic_field_089":[],"synthetic_field_090":null,"synthetic_field_091":true,"synthetic_field_092":false,"synthetic_field_093":[{"content":"synthetic-value-208","synthetic_field_094":false,"synthetic_field_095":"synthetic-value-209"}],"thinking":null}',
              },
            },
            {
              key: "gen_ai.tool.definitions",
              value: {
                stringValue:
                  '[{"type":"function","name":"synthetic_tool_001","description":"Synthetic description 210.","parameters":{"additionalProperties":false,"properties":{"url":{"type":"string"}},"required":["synthetic_field_007"],"type":"object"}},{"type":"function","name":"synthetic_tool_002","description":"Synthetic description 211.","parameters":{"additionalProperties":false,"properties":{},"type":"object"}},{"type":"function","name":"synthetic_tool_003","description":"Synthetic description 212.","parameters":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 213.","format":"synthetic-value-214","type":"string"}},"required":["synthetic_field_022"],"type":"object"}},{"type":"function","name":"synthetic_tool_004","description":"Synthetic description 215.","parameters":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_023":"synthetic-value-216","synthetic_field_024":"synthetic-value-217","synthetic_field_025":"synthetic-value-218","synthetic_field_026":"synthetic-value-219","synthetic_field_027":"synthetic-value-220","synthetic_field_028":"synthetic-value-221","synthetic_field_029":"synthetic-value-222","synthetic_field_030":"synthetic-value-223","synthetic_field_031":85000,"synthetic_field_032":65000,"synthetic_field_033":"synthetic-value-224","synthetic_field_034":"synthetic-value-225"}],"properties":{"synthetic_field_034":{"description":"Synthetic description 226.","synthetic_field_021":["synthetic-value-227"],"synthetic_field_035":255,"synthetic_field_036":1,"type":"string"},"synthetic_field_029":{"synthetic_field_037":null,"description":"Synthetic description 228.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_026":{"synthetic_field_037":null,"description":"Synthetic description 229.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_027":{"synthetic_field_037":null,"description":"Synthetic description 230.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_023":{"synthetic_field_037":null,"description":"Synthetic description 231.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_024":{"synthetic_field_037":null,"description":"Synthetic description 232.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_025":{"synthetic_field_037":null,"description":"Synthetic description 233.","synthetic_field_021":["synthetic-value-234"],"anyOf":[{"synthetic_field_038":"synthetic-value-235"},{"type":"null"}]},"synthetic_field_028":{"synthetic_field_037":null,"description":"Synthetic description 236.","synthetic_field_021":["synthetic-value-237"],"anyOf":[{"synthetic_field_038":"synthetic-value-238"},{"type":"null"}]},"synthetic_field_033":{"synthetic_field_037":null,"description":"Synthetic description 239.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_039":{"synthetic_field_037":null,"description":"Synthetic description 240.","anyOf":[{"items":{"synthetic_field_038":"synthetic-value-241"},"type":"synthetic-value-242"},{"type":"null"}]},"synthetic_field_030":{"synthetic_field_037":null,"description":"Synthetic description 243.","synthetic_field_021":["synthetic-value-244"],"anyOf":[{"synthetic_field_038":"synthetic-value-245"},{"type":"null"}]},"synthetic_field_032":{"synthetic_field_037":null,"description":"Synthetic description 246.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_031":{"synthetic_field_037":null,"description":"Synthetic description 247.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_040":{"synthetic_field_037":null,"description":"Synthetic description 248.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_041":{"synthetic_field_037":null,"description":"Synthetic description 249.","anyOf":[{"type":"integer"},{"type":"null"}]}},"required":["synthetic_field_034"],"type":"object","synthetic_field_042":{"synthetic_field_043":{"enum":["synthetic-value-250","synthetic-value-251","synthetic-value-252","synthetic-value-253","synthetic-value-254","synthetic-value-255","synthetic-value-256","synthetic-value-257","synthetic-value-258","synthetic-value-259"],"type":"string"},"synthetic_field_044":{"enum":["synthetic-value-260","synthetic-value-261","synthetic-value-262"],"type":"string"},"synthetic_field_045":{"enum":["synthetic-value-263","synthetic-value-264","synthetic-value-265"],"type":"string"},"synthetic_field_046":{"properties":{"synthetic_field_047":{"description":"Synthetic description 266.","type":"string"},"synthetic_field_048":{"synthetic_field_037":null,"description":"Synthetic description 267.","synthetic_field_021":["synthetic-value-268"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_049":{"synthetic_field_037":null,"description":"Synthetic description 269.","synthetic_field_021":["synthetic-value-270"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_050":{"synthetic_field_037":null,"description":"Synthetic description 271.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_051":{"synthetic_field_037":null,"description":"Synthetic description 272.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_052":{"synthetic_field_037":null,"description":"Synthetic description 273.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_053":{"synthetic_field_037":null,"description":"Synthetic description 274.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_054":{"description":"Synthetic description 275.","synthetic_field_021":["synthetic-value-276"],"type":"string"},"synthetic_field_055":{"synthetic_field_037":null,"description":"Synthetic description 277.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_056":{"description":"Synthetic description 278.","type":"string"},"synthetic_field_057":{"synthetic_field_037":null,"description":"Synthetic description 279.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_058":{"synthetic_field_037":null,"description":"Synthetic description 280.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_059":{"synthetic_field_037":null,"description":"Synthetic description 281.","anyOf":[{"type":"string"},{"type":"null"}]}},"required":["synthetic_field_047","synthetic_field_054","synthetic_field_056"],"type":"object","additionalProperties":false}}}},{"type":"function","name":"synthetic_tool_005","description":"Synthetic description 282.","parameters":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","synthetic_field_028":"synthetic-value-283","synthetic_field_031":90000,"synthetic_field_032":70000,"synthetic_field_033":"synthetic-value-284"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 285.","format":"synthetic-value-286","type":"string"},"synthetic_field_034":{"synthetic_field_037":null,"description":"Synthetic description 287.","synthetic_field_021":["synthetic-value-288"],"anyOf":[{"synthetic_field_035":255,"synthetic_field_036":1,"type":"string"},{"type":"null"}]},"synthetic_field_029":{"synthetic_field_037":null,"description":"Synthetic description 289.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_026":{"synthetic_field_037":null,"description":"Synthetic description 290.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_027":{"synthetic_field_037":null,"description":"Synthetic description 291.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_023":{"synthetic_field_037":null,"description":"Synthetic description 292.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_024":{"synthetic_field_037":null,"description":"Synthetic description 293.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_025":{"synthetic_field_037":null,"description":"Synthetic description 294.","synthetic_field_021":["synthetic-value-295"],"anyOf":[{"synthetic_field_038":"synthetic-value-296"},{"type":"null"}]},"synthetic_field_028":{"synthetic_field_037":null,"description":"Synthetic description 297.","synthetic_field_021":["synthetic-value-298"],"anyOf":[{"synthetic_field_038":"synthetic-value-299"},{"type":"null"}]},"synthetic_field_033":{"synthetic_field_037":null,"description":"Synthetic description 300.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_039":{"synthetic_field_037":null,"description":"Synthetic description 301.","anyOf":[{"items":{"synthetic_field_038":"synthetic-value-302"},"type":"synthetic-value-303"},{"type":"null"}]},"synthetic_field_030":{"synthetic_field_037":null,"description":"Synthetic description 304.","synthetic_field_021":["synthetic-value-305"],"anyOf":[{"synthetic_field_038":"synthetic-value-306"},{"type":"null"}]},"synthetic_field_032":{"synthetic_field_037":null,"description":"Synthetic description 307.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_031":{"synthetic_field_037":null,"description":"Synthetic description 308.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_040":{"synthetic_field_037":null,"description":"Synthetic description 309.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_041":{"synthetic_field_037":null,"description":"Synthetic description 310.","anyOf":[{"type":"integer"},{"type":"null"}]}},"required":["synthetic_field_022"],"type":"object","synthetic_field_042":{"synthetic_field_043":{"enum":["synthetic-value-311","synthetic-value-312","synthetic-value-313","synthetic-value-314","synthetic-value-315","synthetic-value-316","synthetic-value-317","synthetic-value-318","synthetic-value-319","synthetic-value-320"],"type":"string"},"synthetic_field_044":{"enum":["synthetic-value-321","synthetic-value-322","synthetic-value-323"],"type":"string"},"synthetic_field_045":{"enum":["synthetic-value-324","synthetic-value-325","synthetic-value-326"],"type":"string"},"synthetic_field_046":{"properties":{"synthetic_field_047":{"description":"Synthetic description 327.","type":"string"},"synthetic_field_048":{"synthetic_field_037":null,"description":"Synthetic description 328.","synthetic_field_021":["synthetic-value-329"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_049":{"synthetic_field_037":null,"description":"Synthetic description 330.","synthetic_field_021":["synthetic-value-331"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_050":{"synthetic_field_037":null,"description":"Synthetic description 332.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_051":{"synthetic_field_037":null,"description":"Synthetic description 333.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_052":{"synthetic_field_037":null,"description":"Synthetic description 334.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_053":{"synthetic_field_037":null,"description":"Synthetic description 335.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_054":{"description":"Synthetic description 336.","synthetic_field_021":["synthetic-value-337"],"type":"string"},"synthetic_field_055":{"synthetic_field_037":null,"description":"Synthetic description 338.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_056":{"description":"Synthetic description 339.","type":"string"},"synthetic_field_057":{"synthetic_field_037":null,"description":"Synthetic description 340.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_058":{"synthetic_field_037":null,"description":"Synthetic description 341.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_059":{"synthetic_field_037":null,"description":"Synthetic description 342.","anyOf":[{"type":"string"},{"type":"null"}]}},"required":["synthetic_field_047","synthetic_field_054","synthetic_field_056"],"type":"object","additionalProperties":false}}}},{"type":"function","name":"synthetic_tool_006","description":"Synthetic description 343.","parameters":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_060":"synthetic-input-344"},{"synthetic_field_060":"synthetic-input-345"}],"properties":{"synthetic_field_060":{"description":"Synthetic description 346.","synthetic_field_021":["synthetic-value-347","synthetic-value-348"],"synthetic_field_036":1,"type":"string"}},"required":["synthetic_field_060"],"type":"object"}},{"type":"function","name":"synthetic_tool_007","description":"Synthetic description 349.","parameters":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","status":"synthetic-value-350"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 351.","format":"synthetic-value-352","type":"string"},"status":{"description":"Synthetic description 353.","synthetic_field_021":["synthetic-value-354"],"anyOf":[{"synthetic_field_038":"synthetic-value-355"}]}},"required":["synthetic_field_022","synthetic_field_061"],"type":"object","synthetic_field_042":{"synthetic_field_062":{"enum":["synthetic-value-356","synthetic-value-357","synthetic-value-358"],"type":"string"}}}},{"type":"function","name":"synthetic_tool_008","description":"Synthetic description 359.","parameters":{"additionalProperties":false,"properties":{},"type":"object"}},{"type":"function","name":"synthetic_tool_009","description":"Synthetic description 360.","parameters":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_063":[{"description":"Synthetic description 361.","synthetic_field_034":"synthetic-value-362"},{"description":"Synthetic description 363.","synthetic_field_034":"synthetic-value-364"}],"synthetic_field_022":"synthetic_id_002"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 365.","format":"synthetic-value-366","type":"string"},"synthetic_field_063":{"description":"Synthetic description 367.","items":{"synthetic_field_038":"synthetic-value-368"},"synthetic_field_064":5,"type":"synthetic-value-369"}},"required":["synthetic_field_022","synthetic_field_063"],"type":"object","synthetic_field_042":{"synthetic_field_065":{"additionalProperties":false,"properties":{"synthetic_field_034":{"description":"Synthetic description 370.","synthetic_field_035":255,"type":"string"},"description":{"description":"Synthetic description 371.","type":"string"}},"required":["synthetic_field_034","synthetic_field_066"],"type":"object"}}}},{"type":"function","name":"synthetic_tool_010","description":"Synthetic description 372.","parameters":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","synthetic_field_067":[{"synthetic_field_068":"synthetic-value-373","required":true,"type":"boolean"},{"synthetic_field_068":"synthetic-value-374","required":false,"type":"text"}]}],"properties":{"synthetic_field_022":{"description":"Synthetic description 375.","format":"synthetic-value-376","type":"string"},"synthetic_field_067":{"description":"Synthetic description 377.","items":{"synthetic_field_038":"synthetic-value-378"},"type":"synthetic-value-379"}},"required":["synthetic_field_022","synthetic_field_067"],"type":"object","synthetic_field_042":{"synthetic_field_069":{"additionalProperties":false,"properties":{"synthetic_field_068":{"description":"Synthetic description 380.","synthetic_field_036":1,"type":"string"},"type":{"description":"Synthetic description 381.","enum":["text","boolean","synthetic-value-382"],"type":"string"},"required":{"description":"Synthetic description 383.","type":"boolean"}},"required":["synthetic_field_068","synthetic_field_070","synthetic_field_071"],"type":"object"}}}},{"type":"function","name":"synthetic_tool_011","description":"Synthetic description 384.","parameters":{"additionalProperties":false,"properties":{"synthetic_field_072":{"description":"Synthetic description 385.","synthetic_field_036":1,"type":"string"}},"required":["synthetic_field_072"],"type":"object"}}]',
              },
            },
            {
              key: "gen_ai.request.max_tokens",
              value: {
                intValue: "synthetic-value-386",
              },
            },
            {
              key: "synthetic.metadata.008",
              value: {
                stringValue: "synthetic-value-387",
              },
            },
            {
              key: "synthetic.metadata.009",
              value: {
                stringValue: "synthetic-value-388",
              },
            },
            {
              key: "langfuse.trace.name",
              value: {
                stringValue: "synthetic-value-389",
              },
            },
            {
              key: "langfuse.environment",
              value: {
                stringValue: "synthetic-value-390",
              },
            },
            {
              key: "gen_ai.input.messages",
              value: {
                stringValue:
                  '[{"role":"user","parts":[{"type":"text","content":"Synthetic user request 391."}]}]',
              },
            },
            {
              key: "gen_ai.output.messages",
              value: {
                stringValue:
                  '[{"role":"assistant","parts":[{"type":"tool_call","id":"call_001","name":"synthetic_tool_011","arguments":"{\\"synthetic_field_072\\":\\"Synthetic assistant response 392.\\"}"}],"finish_reason":"tool_call"}]',
              },
            },
            {
              key: "gen_ai.system_instructions",
              value: {
                stringValue:
                  '[{"type":"text","content":"synthetic-value-393"}]',
              },
            },
            {
              key: "synthetic.metadata.010",
              value: {
                stringValue:
                  '{"type":"object","properties":{"gen_ai.input.messages":{"type":"synthetic-value-394"},"gen_ai.output.messages":{"type":"synthetic-value-395"},"gen_ai.system_instructions":{"type":"synthetic-value-396"},"synthetic_field_096":{"type":"object"}}}',
              },
            },
            {
              key: "gen_ai.usage.input_tokens",
              value: {
                intValue: "synthetic-value-397",
              },
            },
            {
              key: "gen_ai.usage.output_tokens",
              value: {
                intValue: "synthetic-value-398",
              },
            },
            {
              key: "gen_ai.usage.details.accepted_prediction_tokens",
              value: {
                intValue: "synthetic-value-399",
              },
            },
            {
              key: "gen_ai.usage.details.audio_tokens",
              value: {
                intValue: "synthetic-value-400",
              },
            },
            {
              key: "gen_ai.usage.details.reasoning_tokens",
              value: {
                intValue: "synthetic-value-401",
              },
            },
            {
              key: "gen_ai.usage.details.rejected_prediction_tokens",
              value: {
                intValue: "synthetic-value-402",
              },
            },
            {
              key: "gen_ai.response.model",
              value: {
                stringValue: "synthetic-value-403",
              },
            },
            {
              key: "synthetic.metadata.011",
              value: {
                doubleValue: 0.005547,
              },
            },
            {
              key: "gen_ai.response.id",
              value: {
                stringValue: "synthetic-value-404",
              },
            },
            {
              key: "gen_ai.response.finish_reasons",
              value: {
                arrayValue: {
                  values: [
                    {
                      stringValue: "synthetic-value-405",
                    },
                  ],
                },
              },
            },
            {
              key: "gen_ai.client.operation.time_to_first_chunk",
              value: {
                doubleValue: 1.18922124899996,
              },
            },
          ],
          status: {},
        },
      ],
    },
    resourceAttributes: {
      "telemetry.sdk.language": "python",
      "telemetry.sdk.name": "opentelemetry",
      "telemetry.sdk.version": "1.39.1",
      "synthetic.metadata.001": "synthetic-value-008",
      "service.version": "synthetic-value-009",
      "synthetic.metadata.002": "synthetic-value-010",
      "synthetic.metadata.003": "synthetic-value-011",
      "synthetic.metadata.004": "synthetic-value-012",
      "synthetic.metadata.005": "synthetic-value-013",
      "service.name": "synthetic-service",
      "telemetry.auto.version": "synthetic-value-014",
    },
  },
  spanIO: {
    input: {
      messages: [
        {
          role: "system",
          content: "synthetic-value-393",
        },
        {
          role: "user",
          parts: [
            {
              type: "text",
              content: "Synthetic user request 391.",
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          name: "synthetic_tool_001",
          description: "Synthetic description 210.",
          parameters: {
            additionalProperties: false,
            properties: {
              url: {
                type: "string",
              },
            },
            required: ["synthetic_field_007"],
            type: "object",
          },
        },
        {
          type: "function",
          name: "synthetic_tool_002",
          description: "Synthetic description 211.",
          parameters: {
            additionalProperties: false,
            properties: {},
            type: "object",
          },
        },
        {
          type: "function",
          name: "synthetic_tool_003",
          description: "Synthetic description 212.",
          parameters: {
            additionalProperties: false,
            synthetic_field_021: [
              {
                synthetic_field_022: "synthetic_id_002",
              },
            ],
            properties: {
              synthetic_field_022: {
                description: "Synthetic description 213.",
                format: "synthetic-value-214",
                type: "string",
              },
            },
            required: ["synthetic_field_022"],
            type: "object",
          },
        },
        {
          type: "function",
          name: "synthetic_tool_004",
          description: "Synthetic description 215.",
          parameters: {
            additionalProperties: false,
            synthetic_field_021: [
              {
                synthetic_field_023: "synthetic-value-216",
                synthetic_field_024: "synthetic-value-217",
                synthetic_field_025: "synthetic-value-218",
                synthetic_field_026: "synthetic-value-219",
                synthetic_field_027: "synthetic-value-220",
                synthetic_field_028: "synthetic-value-221",
                synthetic_field_029: "synthetic-value-222",
                synthetic_field_030: "synthetic-value-223",
                synthetic_field_031: 85000,
                synthetic_field_032: 65000,
                synthetic_field_033: "synthetic-value-224",
                synthetic_field_034: "synthetic-value-225",
              },
            ],
            properties: {
              synthetic_field_034: {
                description: "Synthetic description 226.",
                synthetic_field_021: ["synthetic-value-227"],
                synthetic_field_035: 255,
                synthetic_field_036: 1,
                type: "string",
              },
              synthetic_field_029: {
                synthetic_field_037: null,
                description: "Synthetic description 228.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_026: {
                synthetic_field_037: null,
                description: "Synthetic description 229.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_027: {
                synthetic_field_037: null,
                description: "Synthetic description 230.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_023: {
                synthetic_field_037: null,
                description: "Synthetic description 231.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_024: {
                synthetic_field_037: null,
                description: "Synthetic description 232.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_025: {
                synthetic_field_037: null,
                description: "Synthetic description 233.",
                synthetic_field_021: ["synthetic-value-234"],
                anyOf: [
                  {
                    synthetic_field_038: "synthetic-value-235",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_028: {
                synthetic_field_037: null,
                description: "Synthetic description 236.",
                synthetic_field_021: ["synthetic-value-237"],
                anyOf: [
                  {
                    synthetic_field_038: "synthetic-value-238",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_033: {
                synthetic_field_037: null,
                description: "Synthetic description 239.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_039: {
                synthetic_field_037: null,
                description: "Synthetic description 240.",
                anyOf: [
                  {
                    items: {
                      synthetic_field_038: "synthetic-value-241",
                    },
                    type: "synthetic-value-242",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_030: {
                synthetic_field_037: null,
                description: "Synthetic description 243.",
                synthetic_field_021: ["synthetic-value-244"],
                anyOf: [
                  {
                    synthetic_field_038: "synthetic-value-245",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_032: {
                synthetic_field_037: null,
                description: "Synthetic description 246.",
                anyOf: [
                  {
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_031: {
                synthetic_field_037: null,
                description: "Synthetic description 247.",
                anyOf: [
                  {
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_040: {
                synthetic_field_037: null,
                description: "Synthetic description 248.",
                anyOf: [
                  {
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_041: {
                synthetic_field_037: null,
                description: "Synthetic description 249.",
                anyOf: [
                  {
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
              },
            },
            required: ["synthetic_field_034"],
            type: "object",
            synthetic_field_042: {
              synthetic_field_043: {
                enum: [
                  "synthetic-value-250",
                  "synthetic-value-251",
                  "synthetic-value-252",
                  "synthetic-value-253",
                  "synthetic-value-254",
                  "synthetic-value-255",
                  "synthetic-value-256",
                  "synthetic-value-257",
                  "synthetic-value-258",
                  "synthetic-value-259",
                ],
                type: "string",
              },
              synthetic_field_044: {
                enum: [
                  "synthetic-value-260",
                  "synthetic-value-261",
                  "synthetic-value-262",
                ],
                type: "string",
              },
              synthetic_field_045: {
                enum: [
                  "synthetic-value-263",
                  "synthetic-value-264",
                  "synthetic-value-265",
                ],
                type: "string",
              },
              synthetic_field_046: {
                properties: {
                  synthetic_field_047: {
                    description: "Synthetic description 266.",
                    type: "string",
                  },
                  synthetic_field_048: {
                    synthetic_field_037: null,
                    description: "Synthetic description 267.",
                    synthetic_field_021: ["synthetic-value-268"],
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_049: {
                    synthetic_field_037: null,
                    description: "Synthetic description 269.",
                    synthetic_field_021: ["synthetic-value-270"],
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_050: {
                    synthetic_field_037: null,
                    description: "Synthetic description 271.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_051: {
                    synthetic_field_037: null,
                    description: "Synthetic description 272.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_052: {
                    synthetic_field_037: null,
                    description: "Synthetic description 273.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_053: {
                    synthetic_field_037: null,
                    description: "Synthetic description 274.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_054: {
                    description: "Synthetic description 275.",
                    synthetic_field_021: ["synthetic-value-276"],
                    type: "string",
                  },
                  synthetic_field_055: {
                    synthetic_field_037: null,
                    description: "Synthetic description 277.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_056: {
                    description: "Synthetic description 278.",
                    type: "string",
                  },
                  synthetic_field_057: {
                    synthetic_field_037: null,
                    description: "Synthetic description 279.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_058: {
                    synthetic_field_037: null,
                    description: "Synthetic description 280.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_059: {
                    synthetic_field_037: null,
                    description: "Synthetic description 281.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                },
                required: [
                  "synthetic_field_047",
                  "synthetic_field_054",
                  "synthetic_field_056",
                ],
                type: "object",
                additionalProperties: false,
              },
            },
          },
        },
        {
          type: "function",
          name: "synthetic_tool_005",
          description: "Synthetic description 282.",
          parameters: {
            additionalProperties: false,
            synthetic_field_021: [
              {
                synthetic_field_022: "synthetic_id_002",
                synthetic_field_028: "synthetic-value-283",
                synthetic_field_031: 90000,
                synthetic_field_032: 70000,
                synthetic_field_033: "synthetic-value-284",
              },
            ],
            properties: {
              synthetic_field_022: {
                description: "Synthetic description 285.",
                format: "synthetic-value-286",
                type: "string",
              },
              synthetic_field_034: {
                synthetic_field_037: null,
                description: "Synthetic description 287.",
                synthetic_field_021: ["synthetic-value-288"],
                anyOf: [
                  {
                    synthetic_field_035: 255,
                    synthetic_field_036: 1,
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_029: {
                synthetic_field_037: null,
                description: "Synthetic description 289.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_026: {
                synthetic_field_037: null,
                description: "Synthetic description 290.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_027: {
                synthetic_field_037: null,
                description: "Synthetic description 291.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_023: {
                synthetic_field_037: null,
                description: "Synthetic description 292.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_024: {
                synthetic_field_037: null,
                description: "Synthetic description 293.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_025: {
                synthetic_field_037: null,
                description: "Synthetic description 294.",
                synthetic_field_021: ["synthetic-value-295"],
                anyOf: [
                  {
                    synthetic_field_038: "synthetic-value-296",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_028: {
                synthetic_field_037: null,
                description: "Synthetic description 297.",
                synthetic_field_021: ["synthetic-value-298"],
                anyOf: [
                  {
                    synthetic_field_038: "synthetic-value-299",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_033: {
                synthetic_field_037: null,
                description: "Synthetic description 300.",
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_039: {
                synthetic_field_037: null,
                description: "Synthetic description 301.",
                anyOf: [
                  {
                    items: {
                      synthetic_field_038: "synthetic-value-302",
                    },
                    type: "synthetic-value-303",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_030: {
                synthetic_field_037: null,
                description: "Synthetic description 304.",
                synthetic_field_021: ["synthetic-value-305"],
                anyOf: [
                  {
                    synthetic_field_038: "synthetic-value-306",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_032: {
                synthetic_field_037: null,
                description: "Synthetic description 307.",
                anyOf: [
                  {
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_031: {
                synthetic_field_037: null,
                description: "Synthetic description 308.",
                anyOf: [
                  {
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_040: {
                synthetic_field_037: null,
                description: "Synthetic description 309.",
                anyOf: [
                  {
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              synthetic_field_041: {
                synthetic_field_037: null,
                description: "Synthetic description 310.",
                anyOf: [
                  {
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
              },
            },
            required: ["synthetic_field_022"],
            type: "object",
            synthetic_field_042: {
              synthetic_field_043: {
                enum: [
                  "synthetic-value-311",
                  "synthetic-value-312",
                  "synthetic-value-313",
                  "synthetic-value-314",
                  "synthetic-value-315",
                  "synthetic-value-316",
                  "synthetic-value-317",
                  "synthetic-value-318",
                  "synthetic-value-319",
                  "synthetic-value-320",
                ],
                type: "string",
              },
              synthetic_field_044: {
                enum: [
                  "synthetic-value-321",
                  "synthetic-value-322",
                  "synthetic-value-323",
                ],
                type: "string",
              },
              synthetic_field_045: {
                enum: [
                  "synthetic-value-324",
                  "synthetic-value-325",
                  "synthetic-value-326",
                ],
                type: "string",
              },
              synthetic_field_046: {
                properties: {
                  synthetic_field_047: {
                    description: "Synthetic description 327.",
                    type: "string",
                  },
                  synthetic_field_048: {
                    synthetic_field_037: null,
                    description: "Synthetic description 328.",
                    synthetic_field_021: ["synthetic-value-329"],
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_049: {
                    synthetic_field_037: null,
                    description: "Synthetic description 330.",
                    synthetic_field_021: ["synthetic-value-331"],
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_050: {
                    synthetic_field_037: null,
                    description: "Synthetic description 332.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_051: {
                    synthetic_field_037: null,
                    description: "Synthetic description 333.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_052: {
                    synthetic_field_037: null,
                    description: "Synthetic description 334.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_053: {
                    synthetic_field_037: null,
                    description: "Synthetic description 335.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_054: {
                    description: "Synthetic description 336.",
                    synthetic_field_021: ["synthetic-value-337"],
                    type: "string",
                  },
                  synthetic_field_055: {
                    synthetic_field_037: null,
                    description: "Synthetic description 338.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_056: {
                    description: "Synthetic description 339.",
                    type: "string",
                  },
                  synthetic_field_057: {
                    synthetic_field_037: null,
                    description: "Synthetic description 340.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_058: {
                    synthetic_field_037: null,
                    description: "Synthetic description 341.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                  synthetic_field_059: {
                    synthetic_field_037: null,
                    description: "Synthetic description 342.",
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                },
                required: [
                  "synthetic_field_047",
                  "synthetic_field_054",
                  "synthetic_field_056",
                ],
                type: "object",
                additionalProperties: false,
              },
            },
          },
        },
        {
          type: "function",
          name: "synthetic_tool_006",
          description: "Synthetic description 343.",
          parameters: {
            additionalProperties: false,
            synthetic_field_021: [
              {
                synthetic_field_060: "synthetic-input-344",
              },
              {
                synthetic_field_060: "synthetic-input-345",
              },
            ],
            properties: {
              synthetic_field_060: {
                description: "Synthetic description 346.",
                synthetic_field_021: [
                  "synthetic-value-347",
                  "synthetic-value-348",
                ],
                synthetic_field_036: 1,
                type: "string",
              },
            },
            required: ["synthetic_field_060"],
            type: "object",
          },
        },
        {
          type: "function",
          name: "synthetic_tool_007",
          description: "Synthetic description 349.",
          parameters: {
            additionalProperties: false,
            synthetic_field_021: [
              {
                synthetic_field_022: "synthetic_id_002",
                status: "synthetic-value-350",
              },
            ],
            properties: {
              synthetic_field_022: {
                description: "Synthetic description 351.",
                format: "synthetic-value-352",
                type: "string",
              },
              status: {
                description: "Synthetic description 353.",
                synthetic_field_021: ["synthetic-value-354"],
                anyOf: [
                  {
                    synthetic_field_038: "synthetic-value-355",
                  },
                ],
              },
            },
            required: ["synthetic_field_022", "synthetic_field_061"],
            type: "object",
            synthetic_field_042: {
              synthetic_field_062: {
                enum: [
                  "synthetic-value-356",
                  "synthetic-value-357",
                  "synthetic-value-358",
                ],
                type: "string",
              },
            },
          },
        },
        {
          type: "function",
          name: "synthetic_tool_008",
          description: "Synthetic description 359.",
          parameters: {
            additionalProperties: false,
            properties: {},
            type: "object",
          },
        },
        {
          type: "function",
          name: "synthetic_tool_009",
          description: "Synthetic description 360.",
          parameters: {
            additionalProperties: false,
            synthetic_field_021: [
              {
                synthetic_field_063: [
                  {
                    description: "Synthetic description 361.",
                    synthetic_field_034: "synthetic-value-362",
                  },
                  {
                    description: "Synthetic description 363.",
                    synthetic_field_034: "synthetic-value-364",
                  },
                ],
                synthetic_field_022: "synthetic_id_002",
              },
            ],
            properties: {
              synthetic_field_022: {
                description: "Synthetic description 365.",
                format: "synthetic-value-366",
                type: "string",
              },
              synthetic_field_063: {
                description: "Synthetic description 367.",
                items: {
                  synthetic_field_038: "synthetic-value-368",
                },
                synthetic_field_064: 5,
                type: "synthetic-value-369",
              },
            },
            required: ["synthetic_field_022", "synthetic_field_063"],
            type: "object",
            synthetic_field_042: {
              synthetic_field_065: {
                additionalProperties: false,
                properties: {
                  synthetic_field_034: {
                    description: "Synthetic description 370.",
                    synthetic_field_035: 255,
                    type: "string",
                  },
                  description: {
                    description: "Synthetic description 371.",
                    type: "string",
                  },
                },
                required: ["synthetic_field_034", "synthetic_field_066"],
                type: "object",
              },
            },
          },
        },
        {
          type: "function",
          name: "synthetic_tool_010",
          description: "Synthetic description 372.",
          parameters: {
            additionalProperties: false,
            synthetic_field_021: [
              {
                synthetic_field_022: "synthetic_id_002",
                synthetic_field_067: [
                  {
                    synthetic_field_068: "synthetic-value-373",
                    required: true,
                    type: "boolean",
                  },
                  {
                    synthetic_field_068: "synthetic-value-374",
                    required: false,
                    type: "text",
                  },
                ],
              },
            ],
            properties: {
              synthetic_field_022: {
                description: "Synthetic description 375.",
                format: "synthetic-value-376",
                type: "string",
              },
              synthetic_field_067: {
                description: "Synthetic description 377.",
                items: {
                  synthetic_field_038: "synthetic-value-378",
                },
                type: "synthetic-value-379",
              },
            },
            required: ["synthetic_field_022", "synthetic_field_067"],
            type: "object",
            synthetic_field_042: {
              synthetic_field_069: {
                additionalProperties: false,
                properties: {
                  synthetic_field_068: {
                    description: "Synthetic description 380.",
                    synthetic_field_036: 1,
                    type: "string",
                  },
                  type: {
                    description: "Synthetic description 381.",
                    enum: ["text", "boolean", "synthetic-value-382"],
                    type: "string",
                  },
                  required: {
                    description: "Synthetic description 383.",
                    type: "boolean",
                  },
                },
                required: [
                  "synthetic_field_068",
                  "synthetic_field_070",
                  "synthetic_field_071",
                ],
                type: "object",
              },
            },
          },
        },
        {
          type: "function",
          name: "synthetic_tool_011",
          description: "Synthetic description 384.",
          parameters: {
            additionalProperties: false,
            properties: {
              synthetic_field_072: {
                description: "Synthetic description 385.",
                synthetic_field_036: 1,
                type: "string",
              },
            },
            required: ["synthetic_field_072"],
            type: "object",
          },
        },
      ],
    },
    output:
      '[{"role":"assistant","parts":[{"type":"tool_call","id":"call_001","name":"synthetic_tool_011","arguments":"{\\"synthetic_field_072\\":\\"Synthetic assistant response 392.\\"}"}],"finish_reason":"tool_call"}]',
    metadata: {
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openai",
        "gen_ai.system": "synthetic-value-015",
        "synthetic.metadata.006": "synthetic-value-016",
        "gen_ai.request.model": "gpt-5.4-mini-2026-03-17",
        "gen_ai.agent.name": "synthetic-value-017",
        "gen_ai.agent.call.id": "synthetic-value-018",
        "gen_ai.conversation.id": "synthetic-value-019",
        "synthetic.metadata.007":
          '{"synthetic_field_006":[{"name":"synthetic_name_002","parameters_json_schema":{"additionalProperties":false,"properties":{"url":{"type":"string"}},"required":["synthetic_field_007"],"type":"object"},"description":"Synthetic description 020.","synthetic_field_008":null,"synthetic_field_009":true,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_003","parameters_json_schema":{"additionalProperties":false,"properties":{},"type":"object"},"description":"Synthetic description 021.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_004","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 022.","format":"synthetic-value-023","type":"string"}},"required":["synthetic_field_022"],"type":"object"},"description":"Synthetic description 024.","synthetic_field_008":null,"synthetic_field_009":true,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_005","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_023":"synthetic-value-025","synthetic_field_024":"synthetic-value-026","synthetic_field_025":"synthetic-value-027","synthetic_field_026":"synthetic-value-028","synthetic_field_027":"synthetic-value-029","synthetic_field_028":"synthetic-value-030","synthetic_field_029":"synthetic-value-031","synthetic_field_030":"synthetic-value-032","synthetic_field_031":85000,"synthetic_field_032":65000,"synthetic_field_033":"synthetic-value-033","synthetic_field_034":"synthetic-value-034"}],"properties":{"synthetic_field_034":{"description":"Synthetic description 035.","synthetic_field_021":["synthetic-value-036"],"synthetic_field_035":255,"synthetic_field_036":1,"type":"string"},"synthetic_field_029":{"synthetic_field_037":null,"description":"Synthetic description 037.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_026":{"synthetic_field_037":null,"description":"Synthetic description 038.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_027":{"synthetic_field_037":null,"description":"Synthetic description 039.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_023":{"synthetic_field_037":null,"description":"Synthetic description 040.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_024":{"synthetic_field_037":null,"description":"Synthetic description 041.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_025":{"synthetic_field_037":null,"description":"Synthetic description 042.","synthetic_field_021":["synthetic-value-043"],"anyOf":[{"synthetic_field_038":"synthetic-value-044"},{"type":"null"}]},"synthetic_field_028":{"synthetic_field_037":null,"description":"Synthetic description 045.","synthetic_field_021":["synthetic-value-046"],"anyOf":[{"synthetic_field_038":"synthetic-value-047"},{"type":"null"}]},"synthetic_field_033":{"synthetic_field_037":null,"description":"Synthetic description 048.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_039":{"synthetic_field_037":null,"description":"Synthetic description 049.","anyOf":[{"items":{"synthetic_field_038":"synthetic-value-050"},"type":"synthetic-value-051"},{"type":"null"}]},"synthetic_field_030":{"synthetic_field_037":null,"description":"Synthetic description 052.","synthetic_field_021":["synthetic-value-053"],"anyOf":[{"synthetic_field_038":"synthetic-value-054"},{"type":"null"}]},"synthetic_field_032":{"synthetic_field_037":null,"description":"Synthetic description 055.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_031":{"synthetic_field_037":null,"description":"Synthetic description 056.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_040":{"synthetic_field_037":null,"description":"Synthetic description 057.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_041":{"synthetic_field_037":null,"description":"Synthetic description 058.","anyOf":[{"type":"integer"},{"type":"null"}]}},"required":["synthetic_field_034"],"type":"object","synthetic_field_042":{"synthetic_field_043":{"enum":["synthetic-value-059","synthetic-value-060","synthetic-value-061","synthetic-value-062","synthetic-value-063","synthetic-value-064","synthetic-value-065","synthetic-value-066","synthetic-value-067","synthetic-value-068"],"type":"string"},"synthetic_field_044":{"enum":["synthetic-value-069","synthetic-value-070","synthetic-value-071"],"type":"string"},"synthetic_field_045":{"enum":["synthetic-value-072","synthetic-value-073","synthetic-value-074"],"type":"string"},"synthetic_field_046":{"properties":{"synthetic_field_047":{"description":"Synthetic description 075.","type":"string"},"synthetic_field_048":{"synthetic_field_037":null,"description":"Synthetic description 076.","synthetic_field_021":["synthetic-value-077"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_049":{"synthetic_field_037":null,"description":"Synthetic description 078.","synthetic_field_021":["synthetic-value-079"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_050":{"synthetic_field_037":null,"description":"Synthetic description 080.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_051":{"synthetic_field_037":null,"description":"Synthetic description 081.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_052":{"synthetic_field_037":null,"description":"Synthetic description 082.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_053":{"synthetic_field_037":null,"description":"Synthetic description 083.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_054":{"description":"Synthetic description 084.","synthetic_field_021":["synthetic-value-085"],"type":"string"},"synthetic_field_055":{"synthetic_field_037":null,"description":"Synthetic description 086.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_056":{"description":"Synthetic description 087.","type":"string"},"synthetic_field_057":{"synthetic_field_037":null,"description":"Synthetic description 088.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_058":{"synthetic_field_037":null,"description":"Synthetic description 089.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_059":{"synthetic_field_037":null,"description":"Synthetic description 090.","anyOf":[{"type":"string"},{"type":"null"}]}},"required":["synthetic_field_047","synthetic_field_054","synthetic_field_056"],"type":"object","additionalProperties":false}}},"description":"Synthetic description 091.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_006","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","synthetic_field_028":"synthetic-value-092","synthetic_field_031":90000,"synthetic_field_032":70000,"synthetic_field_033":"synthetic-value-093"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 094.","format":"synthetic-value-095","type":"string"},"synthetic_field_034":{"synthetic_field_037":null,"description":"Synthetic description 096.","synthetic_field_021":["synthetic-value-097"],"anyOf":[{"synthetic_field_035":255,"synthetic_field_036":1,"type":"string"},{"type":"null"}]},"synthetic_field_029":{"synthetic_field_037":null,"description":"Synthetic description 098.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_026":{"synthetic_field_037":null,"description":"Synthetic description 099.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_027":{"synthetic_field_037":null,"description":"Synthetic description 100.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_023":{"synthetic_field_037":null,"description":"Synthetic description 101.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_024":{"synthetic_field_037":null,"description":"Synthetic description 102.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_025":{"synthetic_field_037":null,"description":"Synthetic description 103.","synthetic_field_021":["synthetic-value-104"],"anyOf":[{"synthetic_field_038":"synthetic-value-105"},{"type":"null"}]},"synthetic_field_028":{"synthetic_field_037":null,"description":"Synthetic description 106.","synthetic_field_021":["synthetic-value-107"],"anyOf":[{"synthetic_field_038":"synthetic-value-108"},{"type":"null"}]},"synthetic_field_033":{"synthetic_field_037":null,"description":"Synthetic description 109.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_039":{"synthetic_field_037":null,"description":"Synthetic description 110.","anyOf":[{"items":{"synthetic_field_038":"synthetic-value-111"},"type":"synthetic-value-112"},{"type":"null"}]},"synthetic_field_030":{"synthetic_field_037":null,"description":"Synthetic description 113.","synthetic_field_021":["synthetic-value-114"],"anyOf":[{"synthetic_field_038":"synthetic-value-115"},{"type":"null"}]},"synthetic_field_032":{"synthetic_field_037":null,"description":"Synthetic description 116.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_031":{"synthetic_field_037":null,"description":"Synthetic description 117.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_040":{"synthetic_field_037":null,"description":"Synthetic description 118.","anyOf":[{"type":"integer"},{"type":"null"}]},"synthetic_field_041":{"synthetic_field_037":null,"description":"Synthetic description 119.","anyOf":[{"type":"integer"},{"type":"null"}]}},"required":["synthetic_field_022"],"type":"object","synthetic_field_042":{"synthetic_field_043":{"enum":["synthetic-value-120","synthetic-value-121","synthetic-value-122","synthetic-value-123","synthetic-value-124","synthetic-value-125","synthetic-value-126","synthetic-value-127","synthetic-value-128","synthetic-value-129"],"type":"string"},"synthetic_field_044":{"enum":["synthetic-value-130","synthetic-value-131","synthetic-value-132"],"type":"string"},"synthetic_field_045":{"enum":["synthetic-value-133","synthetic-value-134","synthetic-value-135"],"type":"string"},"synthetic_field_046":{"properties":{"synthetic_field_047":{"description":"Synthetic description 136.","type":"string"},"synthetic_field_048":{"synthetic_field_037":null,"description":"Synthetic description 137.","synthetic_field_021":["synthetic-value-138"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_049":{"synthetic_field_037":null,"description":"Synthetic description 139.","synthetic_field_021":["synthetic-value-140"],"anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_050":{"synthetic_field_037":null,"description":"Synthetic description 141.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_051":{"synthetic_field_037":null,"description":"Synthetic description 142.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_052":{"synthetic_field_037":null,"description":"Synthetic description 143.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_053":{"synthetic_field_037":null,"description":"Synthetic description 144.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_054":{"description":"Synthetic description 145.","synthetic_field_021":["synthetic-value-146"],"type":"string"},"synthetic_field_055":{"synthetic_field_037":null,"description":"Synthetic description 147.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_056":{"description":"Synthetic description 148.","type":"string"},"synthetic_field_057":{"synthetic_field_037":null,"description":"Synthetic description 149.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_058":{"synthetic_field_037":null,"description":"Synthetic description 150.","anyOf":[{"type":"string"},{"type":"null"}]},"synthetic_field_059":{"synthetic_field_037":null,"description":"Synthetic description 151.","anyOf":[{"type":"string"},{"type":"null"}]}},"required":["synthetic_field_047","synthetic_field_054","synthetic_field_056"],"type":"object","additionalProperties":false}}},"description":"Synthetic description 152.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_007","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_060":"synthetic-input-153"},{"synthetic_field_060":"synthetic-input-154"}],"properties":{"synthetic_field_060":{"description":"Synthetic description 155.","synthetic_field_021":["synthetic-value-156","synthetic-value-157"],"synthetic_field_036":1,"type":"string"}},"required":["synthetic_field_060"],"type":"object"},"description":"Synthetic description 158.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_008","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","status":"synthetic-value-159"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 160.","format":"synthetic-value-161","type":"string"},"status":{"description":"Synthetic description 162.","synthetic_field_021":["synthetic-value-163"],"anyOf":[{"synthetic_field_038":"synthetic-value-164"}]}},"required":["synthetic_field_022","synthetic_field_061"],"type":"object","synthetic_field_042":{"synthetic_field_062":{"enum":["synthetic-value-165","synthetic-value-166","synthetic-value-167"],"type":"string"}}},"description":"Synthetic description 168.","synthetic_field_008":null,"synthetic_field_009":true,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_009","parameters_json_schema":{"additionalProperties":false,"properties":{},"type":"object"},"description":"Synthetic description 169.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_010","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_063":[{"description":"Synthetic description 170.","synthetic_field_034":"synthetic-value-171"},{"description":"Synthetic description 172.","synthetic_field_034":"synthetic-value-173"}],"synthetic_field_022":"synthetic_id_002"}],"properties":{"synthetic_field_022":{"description":"Synthetic description 174.","format":"synthetic-value-175","type":"string"},"synthetic_field_063":{"description":"Synthetic description 176.","items":{"synthetic_field_038":"synthetic-value-177"},"synthetic_field_064":5,"type":"synthetic-value-178"}},"required":["synthetic_field_022","synthetic_field_063"],"type":"object","synthetic_field_042":{"synthetic_field_065":{"additionalProperties":false,"properties":{"synthetic_field_034":{"description":"Synthetic description 179.","synthetic_field_035":255,"type":"string"},"description":{"description":"Synthetic description 180.","type":"string"}},"required":["synthetic_field_034","synthetic_field_066"],"type":"object"}}},"description":"Synthetic description 181.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_011","parameters_json_schema":{"additionalProperties":false,"synthetic_field_021":[{"synthetic_field_022":"synthetic_id_002","synthetic_field_067":[{"synthetic_field_068":"synthetic-value-182","required":true,"type":"boolean"},{"synthetic_field_068":"synthetic-value-183","required":false,"type":"text"}]}],"properties":{"synthetic_field_022":{"description":"Synthetic description 184.","format":"synthetic-value-185","type":"string"},"synthetic_field_067":{"description":"Synthetic description 186.","items":{"synthetic_field_038":"synthetic-value-187"},"type":"synthetic-value-188"}},"required":["synthetic_field_022","synthetic_field_067"],"type":"object","synthetic_field_042":{"synthetic_field_069":{"additionalProperties":false,"properties":{"synthetic_field_068":{"description":"Synthetic description 189.","synthetic_field_036":1,"type":"string"},"type":{"description":"Synthetic description 190.","enum":["text","boolean","synthetic-value-191"],"type":"string"},"required":{"description":"Synthetic description 192.","type":"boolean"}},"required":["synthetic_field_068","synthetic_field_070","synthetic_field_071"],"type":"object"}}},"description":"Synthetic description 193.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null},{"name":"synthetic_name_012","parameters_json_schema":{"additionalProperties":false,"properties":{"synthetic_field_072":{"description":"Synthetic description 194.","synthetic_field_036":1,"type":"string"}},"required":["synthetic_field_072"],"type":"object"},"description":"Synthetic description 195.","synthetic_field_008":null,"synthetic_field_009":false,"synthetic_field_010":false,"kind":"function","synthetic_field_011":null,"synthetic_field_012":null,"synthetic_field_013":false,"synthetic_field_014":null,"synthetic_field_015":null,"synthetic_field_016":null,"synthetic_field_017":null,"synthetic_field_018":null,"synthetic_field_019":"synthetic_id_001","synthetic_field_020":null}],"synthetic_field_073":[],"synthetic_field_074":{"synthetic_field_075":"synthetic-value-196","synthetic_field_076":"synthetic-value-197","synthetic_field_077":"synthetic-value-198","synthetic_field_078":"synthetic-value-199","synthetic_field_079":"synthetic-value-200","synthetic_field_080":"synthetic-value-201","synthetic_field_081":"synthetic-value-202","synthetic_field_082":"synthetic-value-203","synthetic_field_083":"synthetic-value-204","synthetic_field_084":"synthetic-value-205","synthetic_field_085":"synthetic-value-206"},"synthetic_field_086":[],"synthetic_field_087":"synthetic-output-207","synthetic_field_088":null,"synthetic_field_089":[],"synthetic_field_090":null,"synthetic_field_091":true,"synthetic_field_092":false,"synthetic_field_093":[{"content":"synthetic-value-208","synthetic_field_094":false,"synthetic_field_095":"synthetic-value-209"}],"thinking":null}',
        "gen_ai.request.max_tokens": '{"intValue":"synthetic-value-386"}',
        "synthetic.metadata.008": "synthetic-value-387",
        "synthetic.metadata.009": "synthetic-value-388",
        "langfuse.trace.name": "synthetic-value-389",
        "langfuse.environment": "synthetic-value-390",
        "synthetic.metadata.010":
          '{"type":"object","properties":{"gen_ai.input.messages":{"type":"synthetic-value-394"},"gen_ai.output.messages":{"type":"synthetic-value-395"},"gen_ai.system_instructions":{"type":"synthetic-value-396"},"synthetic_field_096":{"type":"object"}}}',
        "gen_ai.usage.input_tokens": '{"intValue":"synthetic-value-397"}',
        "gen_ai.usage.output_tokens": '{"intValue":"synthetic-value-398"}',
        "gen_ai.usage.details.accepted_prediction_tokens":
          '{"intValue":"synthetic-value-399"}',
        "gen_ai.usage.details.audio_tokens":
          '{"intValue":"synthetic-value-400"}',
        "gen_ai.usage.details.reasoning_tokens":
          '{"intValue":"synthetic-value-401"}',
        "gen_ai.usage.details.rejected_prediction_tokens":
          '{"intValue":"synthetic-value-402"}',
        "gen_ai.response.model": "synthetic-value-403",
        "synthetic.metadata.011": "0.005547",
        "gen_ai.response.id": "synthetic-value-404",
        "gen_ai.response.finish_reasons": '["synthetic-value-405"]',
        "gen_ai.client.operation.time_to_first_chunk": "1.18922124899996",
      },
      resourceAttributes: {
        "telemetry.sdk.language": "python",
        "telemetry.sdk.name": "opentelemetry",
        "telemetry.sdk.version": "1.39.1",
        "synthetic.metadata.001": "synthetic-value-008",
        "service.version": "synthetic-value-009",
        "synthetic.metadata.002": "synthetic-value-010",
        "synthetic.metadata.003": "synthetic-value-011",
        "synthetic.metadata.004": "synthetic-value-012",
        "synthetic.metadata.005": "synthetic-value-013",
        "service.name": "synthetic-service",
        "telemetry.auto.version": "synthetic-value-014",
      },
      scope: {
        name: "pydantic-ai",
        version: "2.29.0",
        attributes: {},
      },
    },
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [
          {
            type: "text",
            text: "synthetic-value-393",
          },
        ],
        source: "input",
      },
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "Synthetic user request 391.",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call_001",
            toolName: "synthetic_tool_011",
            input: {
              synthetic_field_072: "Synthetic assistant response 392.",
            },
            toolType: "tool_call",
          },
        ],
        finishReason: { type: "tool-calls", raw: "tool_call" },
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: "synthetic_tool_001",
        description: "Synthetic description 210.",
        inputSchema: {
          additionalProperties: false,
          properties: {
            url: {
              type: "string",
            },
          },
          required: ["synthetic_field_007"],
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_002",
        description: "Synthetic description 211.",
        inputSchema: {
          additionalProperties: false,
          properties: {},
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_003",
        description: "Synthetic description 212.",
        inputSchema: {
          additionalProperties: false,
          synthetic_field_021: [
            {
              synthetic_field_022: "synthetic_id_002",
            },
          ],
          properties: {
            synthetic_field_022: {
              description: "Synthetic description 213.",
              format: "synthetic-value-214",
              type: "string",
            },
          },
          required: ["synthetic_field_022"],
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_004",
        description: "Synthetic description 215.",
        inputSchema: {
          additionalProperties: false,
          synthetic_field_021: [
            {
              synthetic_field_023: "synthetic-value-216",
              synthetic_field_024: "synthetic-value-217",
              synthetic_field_025: "synthetic-value-218",
              synthetic_field_026: "synthetic-value-219",
              synthetic_field_027: "synthetic-value-220",
              synthetic_field_028: "synthetic-value-221",
              synthetic_field_029: "synthetic-value-222",
              synthetic_field_030: "synthetic-value-223",
              synthetic_field_031: 85000,
              synthetic_field_032: 65000,
              synthetic_field_033: "synthetic-value-224",
              synthetic_field_034: "synthetic-value-225",
            },
          ],
          properties: {
            synthetic_field_034: {
              description: "Synthetic description 226.",
              synthetic_field_021: ["synthetic-value-227"],
              synthetic_field_035: 255,
              synthetic_field_036: 1,
              type: "string",
            },
            synthetic_field_029: {
              synthetic_field_037: null,
              description: "Synthetic description 228.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_026: {
              synthetic_field_037: null,
              description: "Synthetic description 229.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_027: {
              synthetic_field_037: null,
              description: "Synthetic description 230.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_023: {
              synthetic_field_037: null,
              description: "Synthetic description 231.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_024: {
              synthetic_field_037: null,
              description: "Synthetic description 232.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_025: {
              synthetic_field_037: null,
              description: "Synthetic description 233.",
              synthetic_field_021: ["synthetic-value-234"],
              anyOf: [
                {
                  synthetic_field_038: "synthetic-value-235",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_028: {
              synthetic_field_037: null,
              description: "Synthetic description 236.",
              synthetic_field_021: ["synthetic-value-237"],
              anyOf: [
                {
                  synthetic_field_038: "synthetic-value-238",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_033: {
              synthetic_field_037: null,
              description: "Synthetic description 239.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_039: {
              synthetic_field_037: null,
              description: "Synthetic description 240.",
              anyOf: [
                {
                  items: {
                    synthetic_field_038: "synthetic-value-241",
                  },
                  type: "synthetic-value-242",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_030: {
              synthetic_field_037: null,
              description: "Synthetic description 243.",
              synthetic_field_021: ["synthetic-value-244"],
              anyOf: [
                {
                  synthetic_field_038: "synthetic-value-245",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_032: {
              synthetic_field_037: null,
              description: "Synthetic description 246.",
              anyOf: [
                {
                  type: "integer",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_031: {
              synthetic_field_037: null,
              description: "Synthetic description 247.",
              anyOf: [
                {
                  type: "integer",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_040: {
              synthetic_field_037: null,
              description: "Synthetic description 248.",
              anyOf: [
                {
                  type: "integer",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_041: {
              synthetic_field_037: null,
              description: "Synthetic description 249.",
              anyOf: [
                {
                  type: "integer",
                },
                {
                  type: "null",
                },
              ],
            },
          },
          required: ["synthetic_field_034"],
          type: "object",
          synthetic_field_042: {
            synthetic_field_043: {
              enum: [
                "synthetic-value-250",
                "synthetic-value-251",
                "synthetic-value-252",
                "synthetic-value-253",
                "synthetic-value-254",
                "synthetic-value-255",
                "synthetic-value-256",
                "synthetic-value-257",
                "synthetic-value-258",
                "synthetic-value-259",
              ],
              type: "string",
            },
            synthetic_field_044: {
              enum: [
                "synthetic-value-260",
                "synthetic-value-261",
                "synthetic-value-262",
              ],
              type: "string",
            },
            synthetic_field_045: {
              enum: [
                "synthetic-value-263",
                "synthetic-value-264",
                "synthetic-value-265",
              ],
              type: "string",
            },
            synthetic_field_046: {
              properties: {
                synthetic_field_047: {
                  description: "Synthetic description 266.",
                  type: "string",
                },
                synthetic_field_048: {
                  synthetic_field_037: null,
                  description: "Synthetic description 267.",
                  synthetic_field_021: ["synthetic-value-268"],
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_049: {
                  synthetic_field_037: null,
                  description: "Synthetic description 269.",
                  synthetic_field_021: ["synthetic-value-270"],
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_050: {
                  synthetic_field_037: null,
                  description: "Synthetic description 271.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_051: {
                  synthetic_field_037: null,
                  description: "Synthetic description 272.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_052: {
                  synthetic_field_037: null,
                  description: "Synthetic description 273.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_053: {
                  synthetic_field_037: null,
                  description: "Synthetic description 274.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_054: {
                  description: "Synthetic description 275.",
                  synthetic_field_021: ["synthetic-value-276"],
                  type: "string",
                },
                synthetic_field_055: {
                  synthetic_field_037: null,
                  description: "Synthetic description 277.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_056: {
                  description: "Synthetic description 278.",
                  type: "string",
                },
                synthetic_field_057: {
                  synthetic_field_037: null,
                  description: "Synthetic description 279.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_058: {
                  synthetic_field_037: null,
                  description: "Synthetic description 280.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_059: {
                  synthetic_field_037: null,
                  description: "Synthetic description 281.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
              },
              required: [
                "synthetic_field_047",
                "synthetic_field_054",
                "synthetic_field_056",
              ],
              type: "object",
              additionalProperties: false,
            },
          },
        },
        type: "function",
      },
      {
        name: "synthetic_tool_005",
        description: "Synthetic description 282.",
        inputSchema: {
          additionalProperties: false,
          synthetic_field_021: [
            {
              synthetic_field_022: "synthetic_id_002",
              synthetic_field_028: "synthetic-value-283",
              synthetic_field_031: 90000,
              synthetic_field_032: 70000,
              synthetic_field_033: "synthetic-value-284",
            },
          ],
          properties: {
            synthetic_field_022: {
              description: "Synthetic description 285.",
              format: "synthetic-value-286",
              type: "string",
            },
            synthetic_field_034: {
              synthetic_field_037: null,
              description: "Synthetic description 287.",
              synthetic_field_021: ["synthetic-value-288"],
              anyOf: [
                {
                  synthetic_field_035: 255,
                  synthetic_field_036: 1,
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_029: {
              synthetic_field_037: null,
              description: "Synthetic description 289.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_026: {
              synthetic_field_037: null,
              description: "Synthetic description 290.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_027: {
              synthetic_field_037: null,
              description: "Synthetic description 291.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_023: {
              synthetic_field_037: null,
              description: "Synthetic description 292.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_024: {
              synthetic_field_037: null,
              description: "Synthetic description 293.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_025: {
              synthetic_field_037: null,
              description: "Synthetic description 294.",
              synthetic_field_021: ["synthetic-value-295"],
              anyOf: [
                {
                  synthetic_field_038: "synthetic-value-296",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_028: {
              synthetic_field_037: null,
              description: "Synthetic description 297.",
              synthetic_field_021: ["synthetic-value-298"],
              anyOf: [
                {
                  synthetic_field_038: "synthetic-value-299",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_033: {
              synthetic_field_037: null,
              description: "Synthetic description 300.",
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_039: {
              synthetic_field_037: null,
              description: "Synthetic description 301.",
              anyOf: [
                {
                  items: {
                    synthetic_field_038: "synthetic-value-302",
                  },
                  type: "synthetic-value-303",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_030: {
              synthetic_field_037: null,
              description: "Synthetic description 304.",
              synthetic_field_021: ["synthetic-value-305"],
              anyOf: [
                {
                  synthetic_field_038: "synthetic-value-306",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_032: {
              synthetic_field_037: null,
              description: "Synthetic description 307.",
              anyOf: [
                {
                  type: "integer",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_031: {
              synthetic_field_037: null,
              description: "Synthetic description 308.",
              anyOf: [
                {
                  type: "integer",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_040: {
              synthetic_field_037: null,
              description: "Synthetic description 309.",
              anyOf: [
                {
                  type: "integer",
                },
                {
                  type: "null",
                },
              ],
            },
            synthetic_field_041: {
              synthetic_field_037: null,
              description: "Synthetic description 310.",
              anyOf: [
                {
                  type: "integer",
                },
                {
                  type: "null",
                },
              ],
            },
          },
          required: ["synthetic_field_022"],
          type: "object",
          synthetic_field_042: {
            synthetic_field_043: {
              enum: [
                "synthetic-value-311",
                "synthetic-value-312",
                "synthetic-value-313",
                "synthetic-value-314",
                "synthetic-value-315",
                "synthetic-value-316",
                "synthetic-value-317",
                "synthetic-value-318",
                "synthetic-value-319",
                "synthetic-value-320",
              ],
              type: "string",
            },
            synthetic_field_044: {
              enum: [
                "synthetic-value-321",
                "synthetic-value-322",
                "synthetic-value-323",
              ],
              type: "string",
            },
            synthetic_field_045: {
              enum: [
                "synthetic-value-324",
                "synthetic-value-325",
                "synthetic-value-326",
              ],
              type: "string",
            },
            synthetic_field_046: {
              properties: {
                synthetic_field_047: {
                  description: "Synthetic description 327.",
                  type: "string",
                },
                synthetic_field_048: {
                  synthetic_field_037: null,
                  description: "Synthetic description 328.",
                  synthetic_field_021: ["synthetic-value-329"],
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_049: {
                  synthetic_field_037: null,
                  description: "Synthetic description 330.",
                  synthetic_field_021: ["synthetic-value-331"],
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_050: {
                  synthetic_field_037: null,
                  description: "Synthetic description 332.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_051: {
                  synthetic_field_037: null,
                  description: "Synthetic description 333.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_052: {
                  synthetic_field_037: null,
                  description: "Synthetic description 334.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_053: {
                  synthetic_field_037: null,
                  description: "Synthetic description 335.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_054: {
                  description: "Synthetic description 336.",
                  synthetic_field_021: ["synthetic-value-337"],
                  type: "string",
                },
                synthetic_field_055: {
                  synthetic_field_037: null,
                  description: "Synthetic description 338.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_056: {
                  description: "Synthetic description 339.",
                  type: "string",
                },
                synthetic_field_057: {
                  synthetic_field_037: null,
                  description: "Synthetic description 340.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_058: {
                  synthetic_field_037: null,
                  description: "Synthetic description 341.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                synthetic_field_059: {
                  synthetic_field_037: null,
                  description: "Synthetic description 342.",
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
              },
              required: [
                "synthetic_field_047",
                "synthetic_field_054",
                "synthetic_field_056",
              ],
              type: "object",
              additionalProperties: false,
            },
          },
        },
        type: "function",
      },
      {
        name: "synthetic_tool_006",
        description: "Synthetic description 343.",
        inputSchema: {
          additionalProperties: false,
          synthetic_field_021: [
            {
              synthetic_field_060: "synthetic-input-344",
            },
            {
              synthetic_field_060: "synthetic-input-345",
            },
          ],
          properties: {
            synthetic_field_060: {
              description: "Synthetic description 346.",
              synthetic_field_021: [
                "synthetic-value-347",
                "synthetic-value-348",
              ],
              synthetic_field_036: 1,
              type: "string",
            },
          },
          required: ["synthetic_field_060"],
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_007",
        description: "Synthetic description 349.",
        inputSchema: {
          additionalProperties: false,
          synthetic_field_021: [
            {
              synthetic_field_022: "synthetic_id_002",
              status: "synthetic-value-350",
            },
          ],
          properties: {
            synthetic_field_022: {
              description: "Synthetic description 351.",
              format: "synthetic-value-352",
              type: "string",
            },
            status: {
              description: "Synthetic description 353.",
              synthetic_field_021: ["synthetic-value-354"],
              anyOf: [
                {
                  synthetic_field_038: "synthetic-value-355",
                },
              ],
            },
          },
          required: ["synthetic_field_022", "synthetic_field_061"],
          type: "object",
          synthetic_field_042: {
            synthetic_field_062: {
              enum: [
                "synthetic-value-356",
                "synthetic-value-357",
                "synthetic-value-358",
              ],
              type: "string",
            },
          },
        },
        type: "function",
      },
      {
        name: "synthetic_tool_008",
        description: "Synthetic description 359.",
        inputSchema: {
          additionalProperties: false,
          properties: {},
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_009",
        description: "Synthetic description 360.",
        inputSchema: {
          additionalProperties: false,
          synthetic_field_021: [
            {
              synthetic_field_063: [
                {
                  description: "Synthetic description 361.",
                  synthetic_field_034: "synthetic-value-362",
                },
                {
                  description: "Synthetic description 363.",
                  synthetic_field_034: "synthetic-value-364",
                },
              ],
              synthetic_field_022: "synthetic_id_002",
            },
          ],
          properties: {
            synthetic_field_022: {
              description: "Synthetic description 365.",
              format: "synthetic-value-366",
              type: "string",
            },
            synthetic_field_063: {
              description: "Synthetic description 367.",
              items: {
                synthetic_field_038: "synthetic-value-368",
              },
              synthetic_field_064: 5,
              type: "synthetic-value-369",
            },
          },
          required: ["synthetic_field_022", "synthetic_field_063"],
          type: "object",
          synthetic_field_042: {
            synthetic_field_065: {
              additionalProperties: false,
              properties: {
                synthetic_field_034: {
                  description: "Synthetic description 370.",
                  synthetic_field_035: 255,
                  type: "string",
                },
                description: {
                  description: "Synthetic description 371.",
                  type: "string",
                },
              },
              required: ["synthetic_field_034", "synthetic_field_066"],
              type: "object",
            },
          },
        },
        type: "function",
      },
      {
        name: "synthetic_tool_010",
        description: "Synthetic description 372.",
        inputSchema: {
          additionalProperties: false,
          synthetic_field_021: [
            {
              synthetic_field_022: "synthetic_id_002",
              synthetic_field_067: [
                {
                  synthetic_field_068: "synthetic-value-373",
                  required: true,
                  type: "boolean",
                },
                {
                  synthetic_field_068: "synthetic-value-374",
                  required: false,
                  type: "text",
                },
              ],
            },
          ],
          properties: {
            synthetic_field_022: {
              description: "Synthetic description 375.",
              format: "synthetic-value-376",
              type: "string",
            },
            synthetic_field_067: {
              description: "Synthetic description 377.",
              items: {
                synthetic_field_038: "synthetic-value-378",
              },
              type: "synthetic-value-379",
            },
          },
          required: ["synthetic_field_022", "synthetic_field_067"],
          type: "object",
          synthetic_field_042: {
            synthetic_field_069: {
              additionalProperties: false,
              properties: {
                synthetic_field_068: {
                  description: "Synthetic description 380.",
                  synthetic_field_036: 1,
                  type: "string",
                },
                type: {
                  description: "Synthetic description 381.",
                  enum: ["text", "boolean", "synthetic-value-382"],
                  type: "string",
                },
                required: {
                  description: "Synthetic description 383.",
                  type: "boolean",
                },
              },
              required: [
                "synthetic_field_068",
                "synthetic_field_070",
                "synthetic_field_071",
              ],
              type: "object",
            },
          },
        },
        type: "function",
      },
      {
        name: "synthetic_tool_011",
        description: "Synthetic description 384.",
        inputSchema: {
          additionalProperties: false,
          properties: {
            synthetic_field_072: {
              description: "Synthetic description 385.",
              synthetic_field_036: 1,
              type: "string",
            },
          },
          required: ["synthetic_field_072"],
          type: "object",
        },
        type: "function",
      },
    ],
  },
} satisfies NormalizedIOFixture;
