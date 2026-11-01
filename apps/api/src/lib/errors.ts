import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends HTTPException {
  constructor(status: ContentfulStatusCode, public code: string, message: string) {
    super(status, { message });
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found`);
export const forbidden = (msg = "You don't have permission to do that") => new ApiError(403, "forbidden", msg);
export const badRequest = (msg: string) => new ApiError(400, "bad_request", msg);
export const limitReached = (msg: string) => new ApiError(402, "limit_reached", msg);
