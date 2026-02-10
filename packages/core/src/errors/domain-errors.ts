export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "VALIDATION"
      | "INTERNAL"
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You are not allowed to perform this action.") {
    super(message, "FORBIDDEN");
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Requested resource was not found.") {
    super(message, "NOT_FOUND");
  }
}

export class ConflictError extends DomainError {
  constructor(message = "Resource version conflict.") {
    super(message, "CONFLICT");
  }
}

export class ValidationError extends DomainError {
  constructor(message = "Invalid request payload.") {
    super(message, "VALIDATION");
  }
}
