export class DocToMdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocToMdError";
  }
}

export class UnsupportedFormatError extends DocToMdError {
  constructor(message = "No converter found for the given input") {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

export interface FailedConversionAttempt {
  converter: string;
  error: Error;
}

export class FileConversionError extends DocToMdError {
  attempts: FailedConversionAttempt[];

  constructor(message: string, attempts: FailedConversionAttempt[]) {
    super(message);
    this.name = "FileConversionError";
    this.attempts = attempts;
  }
}

export class MissingDependencyError extends DocToMdError {
  constructor(dependency: string, message?: string) {
    super(message ?? `Missing dependency: ${dependency}`);
    this.name = "MissingDependencyError";
  }
}
