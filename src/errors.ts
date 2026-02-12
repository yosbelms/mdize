export class MdizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MdizeError";
  }
}

export class UnsupportedFormatError extends MdizeError {
  constructor(message = "No converter found for the given input") {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

export interface FailedConversionAttempt {
  converter: string;
  error: Error;
}

export class FileConversionError extends MdizeError {
  attempts: FailedConversionAttempt[];

  constructor(message: string, attempts: FailedConversionAttempt[]) {
    super(message);
    this.name = "FileConversionError";
    this.attempts = attempts;
  }
}

export class MissingDependencyError extends MdizeError {
  constructor(dependency: string, message?: string) {
    super(message ?? `Missing dependency: ${dependency}`);
    this.name = "MissingDependencyError";
  }
}
