import { Link } from "react-router-dom";
import { EmptyState } from "@/components/cards/EmptyState";

export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <EmptyState title="404 — Not found" hint="This page does not exist." />
      <Link to="/" className="text-sm text-link underline underline-offset-2">
        Back to workspace
      </Link>
    </div>
  );
}
