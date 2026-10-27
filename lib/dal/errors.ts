// What the data access layer says when it refuses. Given: do not change.
//
//  - an unknown row, or a row of ANOTHER organisation, is simply "not found" (null / false): the caller learns nothing about other tenants;
//  - a row of YOUR organisation that your role may not touch is a ForbiddenError: you can see it exists, you may not change it.

export class UnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Sign in to continue.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly status = 403
  constructor(message = 'You are not allowed to do that.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}
