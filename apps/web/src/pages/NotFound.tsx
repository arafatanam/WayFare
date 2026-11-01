import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="page flex flex-col items-center py-24 text-center">
      <div className="text-5xl">🧭</div>
      <h1 className="mt-4 font-display text-3xl font-bold">Off the map</h1>
      <p className="mt-2 text-muted">This page doesn't exist, or you don't have access to it.</p>
      <Link to="/" className="btn-primary mt-6">
        Back home
      </Link>
    </div>
  );
}
