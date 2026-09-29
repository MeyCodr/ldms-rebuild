import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 pt-[15vh]">
      <div className="num text-xs text-ink-3">404</div>
      <h1 className="mt-1 text-xl font-semibold">Record not found</h1>
      <p className="mt-2 text-ink-2">It may have been deleted, or the link is wrong. Staff records outside your access also show this page.</p>
      <Link href="/" className="btn mt-5">
        Back to overview
      </Link>
    </div>
  );
}
