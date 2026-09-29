import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="mx-auto max-w-md px-4 pt-[15vh]">
      <div className="num text-xs text-ink-3">403</div>
      <h1 className="mt-1 text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-ink-2">
        Your account doesn&apos;t include this part of LDMS. If you need it for your work, ask the Learning &amp; Development unit to update your
        access.
      </p>
      <Link href="/" className="btn mt-5">
        Back to overview
      </Link>
    </div>
  );
}
