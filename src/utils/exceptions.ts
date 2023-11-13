export class ResourceNotFoundError extends Error {
  constructor(type: string, id: string) {
    super(`${type} with ${id} not found}`);
    this.name = "ResourceNotFoundError";
  }
}
