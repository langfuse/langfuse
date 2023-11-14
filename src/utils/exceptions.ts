export class ResourceNotFoundError extends Error {
  id: string;
  constructor(type: string, id: string) {
    super(`${type} with ${id} not found}`);
    this.name = "ResourceNotFoundError";
    this.id = id;
  }
}
