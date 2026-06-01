import React from 'react'
import GoogleIcon from './GoogleIcon';

const LoginLoading = () => {
  return (
      <main className="min-h-screen bg-gray-50 flex flex-col justify-center items-center px-4 font-sans">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border border-gray-200 bg-white px-8 py-7 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-gray-50">
            <GoogleIcon className="w-10 h-10" />
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-800">
              Connecting your Google account
            </p>
            <p className="mt-1 text-xs font-medium text-gray-500">
              Setting up your secure session...
            </p>
          </div>

          <div
            className="h-14 w-14 animate-spin rounded-full"
            style={{
              background:
                "conic-gradient(#4285f4 0deg 90deg, #ea4335 90deg 180deg, #fbbc05 180deg 270deg, #34a853 270deg 360deg)",
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 0)",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 0)",
            }}
            aria-label="Connecting"
            role="status"
          />
        </div>
      </main>
  )
}

export default LoginLoading;
