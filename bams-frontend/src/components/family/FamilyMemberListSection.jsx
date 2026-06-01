import { Badge, Spinner } from "@radix-ui/themes";
import { UsersRound } from "lucide-react";

const FamilyMemberListSection = ({ members = [], loading = false }) => {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <UsersRound className="h-4 w-4 text-blue-700" />
          Family Members
        </p>
        <Badge color="green" variant="soft" radius="full">
          {members.length}
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-gray-100 p-3 text-sm text-gray-500">
          <Spinner size="1" />
          Loading members...
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-md border border-gray-100 p-3 text-sm font-medium text-gray-400">
          No family members yet.
        </div>
      ) : (
        <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-md border border-gray-100 p-3">
              {member.picture ? (
                <img
                  src={member.picture}
                  alt={member.name || member.email}
                  className="h-8 w-8 rounded-full bg-gray-100"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                  {(member.name || member.email || "?").slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-800">
                  {member.name || member.email}
                </p>
                <p className="truncate text-xs font-medium text-gray-400">
                  {member.email}
                </p>
              </div>

              {member.is_owner && (
                <Badge color="blue" variant="soft" radius="full">
                  Owner
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default FamilyMemberListSection;
