/** HTTP error with the API's `{ error: { code, message } }` shape. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'HttpError'
  }
}

export const badRequest = (code: string, message?: string) => new HttpError(400, code, message)
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Authentication required') =>
  new HttpError(401, code, message)
export const forbidden = (code = 'FORBIDDEN', message = 'Forbidden') =>
  new HttpError(403, code, message)
export const notFound = (code = 'NOT_FOUND', message = 'Not found') =>
  new HttpError(404, code, message)
export const conflict = (code: string, message?: string) => new HttpError(409, code, message)
export const noDatabase = () =>
  new HttpError(503, 'NO_DATABASE', 'This feature requires a database (DATABASE_URL is not set)')
