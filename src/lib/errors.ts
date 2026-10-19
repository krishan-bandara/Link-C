// Kept free of next/* imports so the worker bundle can share it.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
