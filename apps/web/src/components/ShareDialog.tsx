import type { Member, ShareLink } from "@wayfare/shared";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Copy, Globe, Link2, Lock, Mail, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { del, patch, post } from "@/lib/api";
import { keys, useShareLinks, useTripInvites } from "@/lib/queries";
import { Avatar, Modal, Spinner, useConfirm } from "./ui";

type Visibility = "private" | "link" | "public";

const VIS: { value: Visibility; icon: typeof Lock; label: string; body: string }[] = [
  { value: "private", icon: Lock, label: "Private", body: "Only you and invited collaborators." },
  { value: "link", icon: Link2, label: "Anyone with the link", body: "View-only links you can revoke anytime." },
  { value: "public", icon: Globe, label: "Public", body: "Listed in Explore. Private notes are never shown." },
];

export function ShareDialog({
  open,
  onClose,
  type,
  id,
  visibility,
  members,
  isOwner,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  type: "trip" | "collection";
  id: string;
  visibility: Visibility;
  members?: Member[];
  isOwner: boolean;
  currentUserId?: string;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: links, refetch: refetchLinks } = useShareLinks(type, id, open && isOwner);
  const { data: invites, refetch: refetchInvites } = useTripInvites(id, open && isOwner && type === "trip");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: type === "trip" ? keys.trip(id) : keys.collection(id) });
    qc.invalidateQueries({ queryKey: type === "trip" ? keys.trips : keys.collections });
  };

  const setVisibility = async (v: Visibility) => {
    if (v === "private" && links?.length) {
      const ok = await confirm({ title: "Make private?", body: "All existing share links will stop working.", confirmLabel: "Make private" });
      if (!ok) return;
    }
    try {
      await patch(type === "trip" ? `/trips/${id}` : `/collections/${id}`, { visibility: v });
      if (v === "link" && !links?.length) await post("/share-links", { resourceType: type, resourceId: id });
      refresh();
      refetchLinks();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const linkUrl = (l: ShareLink) => `${location.origin}/s/${l.token}`;
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/trips/${id}/invites`, { email, role });
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      refetchInvites();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Share ${type}`}>
      {!isOwner ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Only the owner can change sharing settings.</p>
          {members && <MemberList members={members} isOwner={false} tripId={id} currentUserId={currentUserId} onChange={refresh} />}
        </div>
      ) : (
        <div className="space-y-6">
          {type === "trip" && (
            <section>
              <h3 className="text-sm font-semibold">Invite collaborators</h3>
              <form onSubmit={invite} className="mt-2 flex gap-2">
                <input className="input h-10 flex-1" type="email" required placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select className="input h-10 w-auto" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")} aria-label="Role">
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button className="btn-primary h-10" disabled={busy}>
                  {busy ? <Spinner className="size-4 text-white" /> : <Mail className="size-4" />}
                </button>
              </form>
              {invites && invites.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <Mail className="size-4 text-slate-400" />
                      <span className="flex-1 truncate">{i.email}</span>
                      <span className="text-xs text-muted">Pending · {i.role}</span>
                      <button
                        className="icon-btn size-7"
                        aria-label={`Revoke invite for ${i.email}`}
                        onClick={async () => {
                          await del(`/trips/${id}/invites/${i.id}`);
                          refetchInvites();
                        }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {members && <MemberList members={members} isOwner tripId={id} currentUserId={currentUserId} onChange={refresh} />}
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold">General access</h3>
            <div className="mt-2 space-y-1.5">
              {VIS.map((v) => (
                <button
                  key={v.value}
                  onClick={() => v.value !== visibility && setVisibility(v.value)}
                  className={clsx("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition", visibility === v.value ? "border-brand-600 bg-brand-50" : "border-line hover:bg-slate-50")}
                >
                  <v.icon className="size-5 text-brand-700" />
                  <span>
                    <span className="block text-sm font-semibold">{v.label}</span>
                    <span className="block text-xs text-muted">{v.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {visibility !== "private" && (
            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">View-only links</h3>
                <button
                  className="btn-ghost btn-sm"
                  onClick={async () => {
                    await post("/share-links", { resourceType: type, resourceId: id });
                    refetchLinks();
                  }}
                >
                  + New link
                </button>
              </div>
              {visibility === "public" && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <Globe className="size-4 text-slate-400" />
                  <span className="flex-1 truncate">{`${location.origin}/p/${type}s/${id}`}</span>
                  <button className="icon-btn size-7" onClick={() => copy(`${location.origin}/p/${type}s/${id}`)} aria-label="Copy public link">
                    <Copy className="size-3.5" />
                  </button>
                </div>
              )}
              <ul className="mt-2 space-y-1">
                {links?.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <Link2 className="size-4 text-slate-400" />
                    <span className="flex-1 truncate font-mono text-xs">{linkUrl(l)}</span>
                    <button className="icon-btn size-7" onClick={() => copy(linkUrl(l))} aria-label="Copy link">
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      className="icon-btn size-7 hover:text-red-600"
                      aria-label="Revoke link"
                      onClick={async () => {
                        const ok = await confirm({ title: "Revoke this link?", body: "Anyone using it will lose access immediately.", confirmLabel: "Revoke", danger: true });
                        if (!ok) return;
                        await del(`/share-links/${l.id}`);
                        refetchLinks();
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
                {links && !links.length && <li className="text-xs text-muted">No active links.</li>}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function MemberList({ members, isOwner, tripId, currentUserId, onChange }: { members: Member[]; isOwner: boolean; tripId: string; currentUserId?: string; onChange: () => void }) {
  const confirm = useConfirm();
  return (
    <ul className="mt-4 space-y-1">
      {members.map((m) => (
        <li key={m.userId} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
          <Avatar name={m.name} image={m.image} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {m.name}
              {m.userId === currentUserId && " (you)"}
            </span>
            <span className="block truncate text-xs text-muted">{m.email}</span>
          </span>
          {m.role === "owner" ? (
            <span className="text-xs font-semibold text-muted">Owner</span>
          ) : isOwner ? (
            <>
              <select
                className="h-8 rounded-lg border border-line bg-white px-2 text-xs"
                value={m.role}
                aria-label={`Role for ${m.name}`}
                onChange={async (e) => {
                  await patch(`/trips/${tripId}/members/${m.userId}`, { role: e.target.value });
                  onChange();
                }}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                className="icon-btn size-8 hover:text-red-600"
                aria-label={`Remove ${m.name}`}
                onClick={async () => {
                  if (!(await confirm({ title: `Remove ${m.name}?`, body: "They'll lose access to this trip.", confirmLabel: "Remove", danger: true }))) return;
                  await del(`/trips/${tripId}/members/${m.userId}`);
                  onChange();
                }}
              >
                <X className="size-4" />
              </button>
            </>
          ) : (
            <span className="text-xs capitalize text-muted">{m.role}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
