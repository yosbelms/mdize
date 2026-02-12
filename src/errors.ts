export class ToMdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToMdError";
  }
}

export class UnsupportedFormatError extends ToMdError {
  constructor(message = "No converter found for the given input") {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

export interface FailedConversionAttempt {
  converter: string;
  error: Error;
}

export class FileConversionError extends ToMdError {
  attempts: FailedConversionAttempt[];

  constructor(message: string, attempts: FailedConversionAttempt[]) {
    super(message);
    this.name = "FileConversionError";
    this.attempts = attempts;
  }
}

export class MissingDependencyError extends ToMdError {
  constructor(dependency: string, message?: string) {
    super(message ?? `Missing dependency: ${dependency}`);
    this.name = "MissingDependencyError";
  }
}
