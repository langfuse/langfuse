export class RessourceNotFoundError extends Error {
  constructor(type: string, id: string) {
    super(`${type} with ${id} not found}`);
    this.name = "RessourceNotFoundError";
  }
}
