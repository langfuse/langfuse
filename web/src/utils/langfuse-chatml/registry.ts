import type { ChatMLMapper } from "./mappers/base";

export class ChatMLMapperRegistry {
  private mappers: ChatMLMapper[] = [];

  register(mapper: ChatMLMapper): void {
    console.log(
      `Registering mapper: ${mapper.name}-${mapper.version} (priority: ${mapper.priority})`,
    );
    this.mappers.push(mapper);
  }

  findMapper(input: unknown, output: unknown): ChatMLMapper | undefined {
    console.log(
      "Finding mapper for input/output:",
      JSON.stringify({ input, output }),
    );

    const sortedMappers = [...this.mappers].sort(
      (a, b) => a.priority - b.priority,
    );

    for (const mapper of sortedMappers) {
      console.log(
        `Checking mapper ${mapper.name}-${mapper.version} (priority: ${mapper.priority})`,
      );

      if (mapper.canMap(input, output)) {
        console.log(`Selected mapper: ${mapper.name}-${mapper.version}`);
        return mapper;
      }
    }

    console.log("No mapper found");
    return undefined;
  }

  getRegisteredMappers(): ReadonlyArray<ChatMLMapper> {
    return [...this.mappers];
  }
}
