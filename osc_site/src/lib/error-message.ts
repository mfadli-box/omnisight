const messages: Record<string, string> = {
  VALIDATION_ERROR: "Please check your input and try again.",
  UNAUTHORIZED: "Your session has expired. Please log in again.",
  FORBIDDEN: "You don't have permission to perform this action.",
  NOT_FOUND: "The requested data was not found.",
  CONFLICT: "This data already exists. Please use a different value.",
  BAD_REQUEST: "The request is invalid. Please check your input.",
  TIMEOUT: "The request timed out. Please try again.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  SERVER_ERROR: "The server encountered an error. Please try again later.",
  EXTERNAL_SERVICE_ERROR: "An external service is temporarily unavailable. Please try again later.",
  INTERNAL_ERROR: "An unexpected error occurred. Please try again.",
  NETWORK_ERROR: "Failed to connect to the server. Please check your connection.",
};

export function getErrorMessage(code: string, fallback?: string): string {
  return messages[code] || fallback || "An unknown error occurred.";
}
