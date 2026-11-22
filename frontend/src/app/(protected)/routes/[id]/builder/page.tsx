'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * VisualRouteBuilderRedirect
 * The Visual Route Builder and Add/Edit Route workflows have been unified into
 * a single seamless builder interface at /routes/[id]/edit.
 * This component cleanly redirects any direct visits or bookmarks.
 */
export default function VisualRouteBuilderRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  useEffect(() => {
    if (id) {
      router.replace(`/routes/${id}/edit`);
    }
  }, [id, router]);

  return (
    <div className="py-20 text-center text-sm text-slate-500">
      Loading unified Route Builder & Editor...
    </div>
  );
}
