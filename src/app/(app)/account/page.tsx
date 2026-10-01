import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/session";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser({ allowPendingPasswordChange: true });
  const { changed } = await searchParams;
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        module="account"
        title="Account"
        meta={
          <span>
            <span className="num">{user.staffNo}</span> · {user.name}
          </span>
        }
      />
      {user.mustChangePassword && (
        <div role="alert" className="notice notice-wait max-w-[640px]">
          You signed in with a temporary password. Choose your own password to continue using LDMS.
        </div>
      )}
      {changed === "1" && !user.mustChangePassword && (
        <div role="status" className="notice notice-ok max-w-[640px]">
          Password changed. You were signed out on any other computer or phone.
        </div>
      )}
      <section aria-labelledby="pw" className="card mt-2 max-w-[640px] p-5 sm:p-7">
        <h2 id="pw" className="ruled-heading">
          Change password
        </h2>
        <div className="pt-4">
          <PasswordForm />
        </div>
      </section>
    </div>
  );
}
