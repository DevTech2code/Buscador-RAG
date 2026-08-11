export class PolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = PolicyViolationError.name;
  }
}
