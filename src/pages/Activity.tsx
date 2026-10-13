import { FriendActivity } from "@/components/FriendActivity";

/** Friend activity as a page, for screens too narrow for the side panel. */
export function Activity() {
  return (
    <div className="mx-auto max-w-2xl pt-4 md:pt-6">
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Friend activity</h1>
      <FriendActivity />
    </div>
  );
}
