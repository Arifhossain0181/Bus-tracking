import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Users } from 'lucide-react';

const CONTRIBUTORS = [
  {
    name: 'Md. Taher Bin Omar Hijbullah',
    role: 'Project Lead & Developer (Map Integration + User Panel)',
    avatar: 'https://github.com/hijbullahx.png',
    linkedin: 'https://www.linkedin.com/in/hijbullah/',
    github: 'https://github.com/hijbullahx',
    email: 'hijbullah119445@gmail.com',
  },
  {
    name: 'Md. Imran Nazir Uday',
    role: 'Developer (Admin Panel + Documentation)',
    avatar: 'https://github.com/udoydev.png',
    linkedin: 'https://www.linkedin.com/in/imran-nazir-udoy/',
    github: 'https://github.com/udoydev',
    email: 'mdimran095m@gmail.com',
  },
  {
    name: 'Md. Rony Mia',
    role: 'Developer (Driver Panel + Documentation)',
    avatar: 'https://github.com/r-ony-s.png',
    linkedin: 'https://www.linkedin.com/in/sazidul-islam-sazid/',
    github: 'https://github.com/r-ony-s',
    email: 'technonautsazid@gmail.com',
  },
  {
    name: 'Sazidul Islam Sazid',
    role: 'Developer (Authority + SQA)',
    avatar: 'https://github.com/technonautSazid.png',
    linkedin: 'https://www.linkedin.com/in/sazidul-islam-sazid/',
    github: 'https://github.com/technonautSazid',
    email: 'technonautsazid@gmail.com',
  },
];

export default function ContributorsPage() {
  return (
    <div className="min-h-screen bg-slate-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white mb-4">
            <Users className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Project Contributors</h1>
          <p className="text-slate-600 mt-1">The team behind UBus Tracking System</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CONTRIBUTORS.map((c) => (
            <div
              key={c.name}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center hover:shadow-md transition-shadow"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.avatar}
                alt={c.name}
                className="w-24 h-24 rounded-full object-cover mx-auto mb-4 border-4 border-indigo-500/30"
              />
              <h2 className="text-lg font-bold text-slate-900">{c.name}</h2>
              <p className="text-sm text-slate-500 mb-4">{c.role}</p>
              <div className="flex flex-col gap-2">
                <a
                  href={c.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2 px-3 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium"
                >
                  LinkedIn
                </a>
                <a
                  href={c.github}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2 px-3 rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-50 text-sm font-medium"
                >
                  GitHub
                </a>
                <a
                  href={`mailto:${c.email}`}
                  className="py-2 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium inline-flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  {c.email}
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </Link>
        </div>
      </div>
    </div>
  );
}
