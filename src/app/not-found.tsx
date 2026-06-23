import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center p-6">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="text-sm font-semibold text-brand-600">404</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you’re looking for doesn’t exist or may have been moved.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <Link href="/dashboard" className="btn-primary">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
