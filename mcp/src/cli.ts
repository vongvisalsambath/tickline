// Entry point for `npx tickline-mcp`.
import { main } from "./server";

main().catch((e) => {
  console.error(e);
  throw e;
});
