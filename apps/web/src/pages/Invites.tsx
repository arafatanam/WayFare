import { useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, PageLoader } from "@/components/ui";
import { post } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { keys, useInvites, useMe } from "@/lib/queries";

export function Invites() {
  const { data, isLoading } = useInvites();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (isLoading) return <PageLoader />;
  return (
    <div className="page max-w-2xl space-y-6">
      <h1 className="page-title">Invitations</h1>
      {data && !data.emailVerified && data.invites.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Verify your email ({me?.email}) to accept invitations.{" "}
          <button
            className="font-semibold underline"
            onClick={async () => {
              await authClient.sendVerificationEmail({ email: me!.email, callbackURL: "/invites" });
              toast.success("Verification email sent");
            }}
          >
            Resend verification email
          </button>
        </div>
      )}
      {!data?.invites.length ? (
        <EmptyState icon={<Mail className="size-6" />} title="No pending invitations" body="When someone invites you to plan a trip together, it shows up here." />
      ) : (
        <ul className="space-y-3">
          {data.invites.map((i) => (
            <li key={i.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{i.tripName}</div>
                <div className="text-sm text-muted">
                  {i.invitedByName ?? "Someone"} invited you as {i.role === "editor" ? "an editor" : "a viewer"} · {timeAgo(i.createdAt)}
                </div>
              </div>
              <button
                className="btn-secondary"
                onClick={async () => {
                  await post(`/invites/${i.id}/decline`);
                  qc.invalidateQueries({ queryKey: keys.invites });
                }}
              >
                Decline
              </button>
              <button
                className="btn-primary"
                disabled={!data.emailVerified}
                onClick={async () => {
                  try {
                    const r = await post<{ tripId: string }>(`/invites/${i.id}/accept`);
                    qc.invalidateQueries({ queryKey: keys.invites });
                    qc.invalidateQueries({ queryKey: keys.trips });
                    navigate(`/trips/${r.tripId}`);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Accept
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
