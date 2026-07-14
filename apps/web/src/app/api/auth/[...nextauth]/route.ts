import { type NextRequest } from "next/server";
import { handlers } from "@/auth";
import { authBasePath, injectAuthBasePath } from "@/lib/auth-route";

type RouteHandler = (req: NextRequest) => Promise<Response>;

function wrap(handler: RouteHandler): RouteHandler {
  return (req) => {
    const fullBase = authBasePath();
    if (fullBase === "/api/auth") return handler(req);
    return handler(injectAuthBasePath(req, fullBase));
  };
}

export const GET = wrap(handlers.GET);
export const POST = wrap(handlers.POST);
