import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 space-y-4">
        <div className="text-5xl font-extrabold text-blue-600">404</div>
        <h1 className="text-xl font-bold text-slate-900">Page Not Found</h1>
        <p className="text-sm text-slate-600">
          The page you are looking for does not exist on this frontend app.
        </p>

        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 text-left">
          <strong>Tip:</strong> If you are trying to access the <strong>Django Admin Panel</strong>, it is running on port 8000:{' '}
          <a
            href="http://localhost:8000/admin/"
            className="underline font-semibold text-blue-600 hover:text-blue-800"
            target="_blank"
            rel="noreferrer"
          >
            http://localhost:8000/admin/
          </a>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
