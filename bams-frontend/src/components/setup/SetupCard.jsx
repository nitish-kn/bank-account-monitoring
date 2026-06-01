import { Card } from "@radix-ui/themes";

export function SetupCard({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/35 px-4 py-8 backdrop-blur-sm">
      <Card className="w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl shadow-blue-950/10">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-500" />
        <div className="p-5 sm:p-7">{children}</div>
      </Card>
    </div>
  );
}