import { handleSupportStarsRequest } from "@/lib/server/support-http";
import { rateLimitSupportRequest } from "@/lib/server/rate-limit";
import { createStarsInvoice, getSupportAvailability } from "@/lib/server/support";

export const maxDuration = 20;

export function POST(request: Request) {
  return handleSupportStarsRequest(request, {
    enabled: () => getSupportAvailability().starsEnabled,
    limit: rateLimitSupportRequest,
    createInvoice: createStarsInvoice,
  });
}
