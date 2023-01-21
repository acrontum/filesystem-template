export class RecipeRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeRuntimeError';
  }
}

export class InvalidSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSchemaError';
  }
}

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}
